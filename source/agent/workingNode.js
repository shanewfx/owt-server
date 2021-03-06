// Copyright (C) <2019> Intel Corporation
//
// SPDX-License-Identifier: Apache-2.0

'use strict';
var fs = require('fs');
var Getopt = require('node-getopt');
var toml = require('toml');

var logger = require('./logger').logger;
var log = logger.getLogger('WorkingNode');

var cxxLogger;
try {
    cxxLogger = require('./logger/build/Release/logger');
} catch (e) {
    log.debug('No native logger for reconfiguration');
}

var config;
try {
  config = toml.parse(fs.readFileSync('./agent.toml'));
} catch (e) {
  log.error('Parsing config error on line ' + e.line + ', column ' + e.column + ': ' + e.message);
  process.exit(1);
}

global.config = config || {};
global.config.webrtc = global.config.webrtc || {};
global.config.webrtc.stunserver = global.config.webrtc.stunserver || '';
global.config.webrtc.stunport = global.config.webrtc.stunport || 0;
global.config.webrtc.minport = global.config.webrtc.minport || 0;
global.config.webrtc.maxport = global.config.webrtc.maxport || 0;
global.config.webrtc.keystorePath = global.config.webrtc.keystorePath || '';
global.config.webrtc.num_workers = global.config.webrtc.num_workers || 24;
global.config.webrtc.use_nicer = global.config.webrtc.use_nicer || false;
global.config.webrtc.io_workers = global.config.webrtc.io_workers || 1;

global.config.video = global.config.video || {};
global.config.video.hardwareAccelerated = !!global.config.video.hardwareAccelerated;
global.config.video.enableBetterHEVCQuality = !!global.config.video.enableBetterHEVCQuality;
global.config.video.MFE_timeout = global.config.video.MFE_timeout || 0;
global.config.video.codecs = {
  decode: ['vp8', 'vp9', 'h264'],
  encode: ['vp8', 'vp9']
};

global.config.avatar = global.config.avatar || {};

global.config.audio = global.config.audio || {};

global.config.recording = global.config.recording || {};
global.config.recording.path = global.config.recording.path || '/tmp';
global.config.recording.initializeTimeout = global.config.recording.initialize_timeout || 3000;

global.config.avstream = global.config.avstream || {};
global.config.avstream.initializeTimeout = global.config.avstream.initialize_timeout || 3000;

global.config.internal = global.config.internal || {};
global.config.internal.protocol = global.config.internal.protocol || 'sctp';
global.config.internal.minport = global.config.internal.minport || 0;
global.config.internal.maxport = global.config.internal.maxport || 0;

// Parse command line arguments
var getopt = new Getopt([
  ['r' , 'rabbit-host=ARG'            , 'RabbitMQ Host'],
  ['g' , 'rabbit-port=ARG'            , 'RabbitMQ Port'],
  ['l' , 'logging-config-file=ARG'    , 'Logging Config File'],
  ['s' , 'stunserver=ARG'             , 'Stun Server hostname'],
  ['p' , 'stunport=ARG'               , 'Stun Server port'],
  ['m' , 'minport=ARG'                , 'Minimum port'],
  ['M' , 'maxport=ARG'                , 'Maximum port'],
  ['h' , 'help'                       , 'display this help']
]);

var opt = getopt.parse(process.argv.slice(2));

for (var prop in opt.options) {
    if (opt.options.hasOwnProperty(prop)) {
        var value = opt.options[prop];
        switch (prop) {
            case 'help':
                getopt.showHelp();
                process.exit(0);
                break;
            case 'rabbit-host':
                global.config.rabbit = global.config.rabbit || {};
                global.config.rabbit.host = value;
                break;
            case 'rabbit-port':
                global.config.rabbit = global.config.rabbit || {};
                global.config.rabbit.port = value;
                break;
            default:
                global.config.webrtc[prop] = value;
                break;
        }
    }
}

var rpc = require('./amqp_client')();

var controller;
function init_controller() {
    log.info('pid:', process.pid);
    log.info('Connecting to rabbitMQ server...');
    rpc.connect(global.config.rabbit, function () {
        rpc.asRpcClient(function(rpcClient) {
            var rpcID = process.argv[2];
            var parentID = process.argv[3];
            var nodeConfig = JSON.parse(process.argv[4]);
            var purpose = nodeConfig.purpose;
            var clusterIP = nodeConfig.clusterIP;

            switch (purpose) {
            case 'conference':
                controller = require('./conference')(rpcClient, rpcID);
                break;
            case 'audio':
                controller = require('./audio')(rpcClient);
                break;
            case 'video':
                global.config.video.codecs = require('./videoCapability');
                controller = require('./video')(rpcClient, clusterIP);
                break;
            case 'webrtc':
                controller = require('./webrtc')(rpcClient);
                break;
            case 'streaming':
                controller = require('./streaming')(rpcClient);
                break;
            case 'recording':
                controller = require('./recording')(rpcClient, rpcID);
                break;
            case 'sip':
                controller = require('./sip')(rpcClient, {id:rpcID, addr:clusterIP});
                break;
            default:
                log.error('Ambiguous purpose:', purpose);
                process.send('ambiguous purpose');
                return;
            }

            controller.networkInterfaces = Array.isArray(nodeConfig.webrtc.network_interface) ? nodeConfig.webrtc.network_interface : [];
            controller.clusterIP = clusterIP;
            controller.agentID = parentID;
            controller.networkInterfaces.forEach((i) => {
                if (i.ip_address) {
                  i.private_ip_match_pattern = new RegExp(i.ip_address, 'g');
                }
            });

            var rpcAPI = (controller.rpcAPI || controller);

            rpc.asRpcServer(rpcID, rpcAPI, function(rpcServer) {
                log.info(rpcID + ' as rpc server ready');
                rpc.asMonitor(function (data) {
                    if (data.reason === 'abnormal' || data.reason === 'error' || data.reason === 'quit') {
                        if (controller && typeof controller.onFaultDetected === 'function') {
                            controller.onFaultDetected(data.message);
                        }
                    }
                }, function (monitor) {
                    log.info(rpcID + ' as monitor ready');
                    process.send('READY');
                    setInterval(() => {
                      process.send('IMOK');
                    }, 1000);
                }, function(reason) {
                    process.send('ERROR');
                    log.error(reason);
                });
            }, function(reason) {
                process.send('ERROR');
                log.error(reason);
            });
        }, function(reason) {
            process.send('ERROR');
            log.error(reason);
        });
    }, function(reason) {
        process.send('ERROR');
        log.error('Node connect to rabbitMQ server failed, reason:', reason);
    });
};

['SIGINT', 'SIGTERM'].map(function (sig) {
    process.on(sig, function () {
        log.warn('Exiting on', sig);
        if (controller && typeof controller.close === 'function') {
            controller.close();
        }
        process.exit();
    });
});

['SIGHUP', 'SIGPIPE'].map(function (sig) {
    process.on(sig, function () {
        log.warn(sig, 'caught and ignored');
    });
});

process.on('exit', function () {
    rpc.disconnect();
});

process.on('unhandledRejection', (reason) => {
    log.info('Reason: ' + reason);
});

process.on('SIGUSR2', function() {
    logger.reconfigure();
    if (cxxLogger) {
        cxxLogger.configure();
    }
});

(function main() {
    init_controller();
})();
