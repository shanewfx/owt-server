/****************************************************************************
 *
 * <COPYRIGHT_TAG>
 *
 ****************************************************************************/

#ifndef __AUDIOPCMWRITER_H__
#define __AUDIOPCMWRITER_H__
#include "base/base_element.h"
#include "base/media_common.h"
#include "base/stream.h"
#include "wave_header.h"
#include "audio_params.h"

class AudioPCMWriter : public BaseElement
{
public:
    AudioPCMWriter(Stream* st, unsigned char* name);
    virtual ~AudioPCMWriter();
    virtual bool Init(void *cfg, ElementMode element_mode);
    virtual int Recycle(MediaBuf &buf);
    virtual int ProcessChain(MediaPad *pad, MediaBuf &buf);
    virtual int HandleProcess();
private:
    AudioPCMWriter();
    void Release();
    int PCMWrite(AudioPayload* pIn);
protected:
    Stream*                       m_pStream;
    AudioStreamInfo               m_StreamInfo;
    Info                          m_WaveInfo;
    WaveHeader                    m_WaveHeader;
    unsigned long long            m_nDataSize;
};

#endif // __AUDIOPCMWRITER_H__