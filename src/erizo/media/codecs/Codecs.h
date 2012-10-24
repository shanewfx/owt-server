
#ifndef CODECS_H_
#define CODECS_H_

#include <boost/cstdint.hpp>
namespace erizo{

  enum VideoCodecID{
    VIDEO_CODEC_VP8,
    VIDEO_CODEC_H264
  };

  enum AudioCodecID{
    AUDIO_CODEC_PCM_MULAW_8
  };

 struct VideoCodecInfo {
    VideoCodecID codec;
    int payloadType;
    int width;
    int height;
    int bitRate;
    int frameRate;
  };

  struct AudioCodecInfo {
    AudioCodecID codec;
    int bitRate;
    int sampleRate;
  };
}
#endif /* CODECS_H_ */
