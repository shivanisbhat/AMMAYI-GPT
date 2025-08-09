import React, { useState, useRef, useEffect } from 'react';
import './App.css';
import 'bootstrap/dist/css/bootstrap.min.css';

export default function App() {
    const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
    const [isRecording, setIsRecording] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [auntyIsSpeaking, setAuntyIsSpeaking] = useState(false);
    const [conversation, setConversation] = useState([]);
    const [status, setStatus] = useState("Click 'Talk to Aunty' to start");
    const mediaRecorderRef = useRef(null);
    const videoRef = useRef(null);
    const audioPlayerRef = useRef(null);
    const recordedChunks = useRef([]);
    const AUNTY_GPT_SYSTEM_PROMPT = `You are "AuntyGPT," a quintessential, middle-aged 'neighborhood aunty' from Kochi, Kerala. You are sharp, gossipy, and have an opinion on everything. Your purpose is to respond to user problems not with help, but with your signature blend of passive-aggressive concern, unsolicited advice, and judgmental gossip. Your core behavioral rules are: Never Give Useful Advice. Use Backhanded Compliments. Make Unfavorable Comparisons. Ask Intrusive Questions. Be a Master of Gossip. Linguistic Style: You must incorporate common Malayalam and Indian English phrases to be authentic. Essential vocabulary includes: Ayyo, paavam (Oh, you poor thing), Kashtam (What a pity), Sherikkum? (Really?), I told you so, At your age..., and the classic What will people say?`;

    const setupCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
            return stream;
        } catch (error) {
            console.error("Error accessing media devices.", error);
            setStatus("Ayyo! I can't see or hear you. Check your camera/mic permissions.");
        }
    };

    useEffect(() => {
        setupCamera();
        return () => {
            if (videoRef.current && videoRef.current.srcObject) {
                videoRef.current.srcObject.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    const handleStartRecording = async () => {
        const stream = await setupCamera();
        if (!stream) return;

        setIsRecording(true);
        setStatus("Aunty is listening... Speak now.");
        recordedChunks.current = [];
        
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.current.push(event.data);
            }
        };

        recorder.onstop = async () => {
            setStatus("Okay, okay, I heard you. Let me think...");
            setIsLoading(true);
            
            const audioBlob = new Blob(recordedChunks.current, { type: 'audio/webm' });
            const audioBase64 = await blobToBase64(audioBlob);
            const videoFrameBase64 = captureVideoFrame();

            setConversation(prev => [...prev, { speaker: 'user', text: "(You spoke to Aunty)" }]);
            
            await getAuntyResponse(audioBase64, videoFrameBase64);
            setIsLoading(false);
        };

        recorder.start();
    };

    const handleStopRecording = () => {
        if (mediaRecorderRef.current) {
            mediaRecorderRef.current.stop();
        }
        setIsRecording(false);
    };

    const captureVideoFrame = () => {
        if (!videoRef.current) return null;
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg').split(',')[1];
    };

    const blobToBase64 = (blob) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.toString().split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    };

    const getAuntyResponse = async (audioBase64, videoFrameBase64) => {
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;

        const payload = {
            contents: [
                {
                    role: "user",
                    parts: [
                        { inlineData: { mimeType: "audio/webm", data: audioBase64 } },
                        { inlineData: { mimeType: "image/jpeg", data: videoFrameBase64 } },
                        { text: "What do you think about this? Respond as AuntyGPT." }
                    ]
                }
            ],
            systemInstruction: {
                parts: [{ text: AUNTY_GPT_SYSTEM_PROMPT }]
            }
        };

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            
            if (result.candidates && result.candidates[0].content.parts[0].text) {
                const auntyText = result.candidates[0].content.parts[0].text;
                setConversation(prev => [...prev, { speaker: 'aunty', text: auntyText }]);
                await getAuntySpeech(auntyText);
            } else {
                console.error("Unexpected API response structure:", result);
                throw new Error("Unexpected API response structure.");
            }
        } catch (error) {
            console.error("Error getting response from AuntyGPT:", error);
            setStatus("Ayyo! Something went wrong. Maybe the internet is not working.");
            setConversation(prev => [...prev, { speaker: 'aunty', text: "Kashtam! I couldn't hear you properly. Try again." }]);
        }
    };

    const getAuntySpeech = async (text) => {
        setStatus("Aunty is about to speak...");
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${GEMINI_API_KEY}`;
        
        const payload = {
            contents: [{ parts: [{ text: text }] }],
            generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: "Sulafat" }
                    }
                }
            },
            model: "gemini-2.5-flash-preview-tts"
        };

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();

            const audioData = result?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            const mimeType = result?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.mimeType;

            if (audioData && mimeType && mimeType.startsWith("audio/")) {
                const sampleRateMatch = mimeType.match(/rate=(\d+)/);
                const sampleRate = sampleRateMatch ? parseInt(sampleRateMatch[1], 10) : 24000;
                
                const pcmData = base64ToArrayBuffer(audioData);
                const pcm16 = new Int16Array(pcmData);
                const wavBlob = pcmToWav(pcm16, sampleRate);
                const audioUrl = URL.createObjectURL(wavBlob);
                const audio = new Audio(audioUrl);
                audio.playbackRate = 1.0; // 1.0 is normal speed, 0.5 is half, 2.0 is double speed
                audioPlayerRef.current = audio;
                
                audio.play();
                setAuntyIsSpeaking(true);
                audio.onended = () => {
                    setAuntyIsSpeaking(false);
                    setStatus("What else? Tell me.");
                };

            } else {
                console.error("Audio data not found in TTS response:", result);
                throw new Error("Audio data not found in TTS response.");
            }
        } catch (error) {
            console.error("Error getting speech from AuntyGPT:", error);
            setStatus("My voice is tired now. Can't talk.");
        }
    };
    
    const base64ToArrayBuffer = (base64) => {
        const binaryString = window.atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    };

    const pcmToWav = (pcmData, sampleRate) => {
        const numChannels = 1;
        const bytesPerSample = 2; // 16-bit PCM
        const blockAlign = numChannels * bytesPerSample;
        const byteRate = sampleRate * blockAlign;
        const dataSize = pcmData.length * bytesPerSample;
        const buffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(buffer);

        view.setUint32(0, 0x52494646, false); // "RIFF"
        view.setUint32(4, 36 + dataSize, true);
        view.setUint32(8, 0x57415645, false); // "WAVE"
        view.setUint32(12, 0x666d7420, false); // "fmt "
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bytesPerSample * 8, true);
        view.setUint32(36, 0x64617461, false); // "data"
        view.setUint32(40, dataSize, true);

        for (let i = 0; i < pcmData.length; i++) {
            view.setInt16(44 + i * 2, pcmData[i], true);
        }

        return new Blob([view], { type: 'audio/wav' });
    };
    return (
        <div className="bg-light position-absolute top-0 start-0 w-100 h-90 d-flex flex-column align-items-center justify-content-center font-monospace text-dark p-4">
            <div className="w-100" style={{ maxWidth: '700px' }}>
                <div className="bg-white rounded-4 shadow-lg p-4 border border-3 border-secondary">
                    <header className="text-center mb-4">
                        <h1 className="display-5 fw-bold text-danger">Talk to AuntyGPT</h1>
                        <p className="lead text-secondary">She has some "advice" for you...</p>
                    </header>

                    <div className="bg-light rounded-3 p-3 mb-4 d-flex flex-column align-items-center">
                        <video
                            ref={videoRef}
                            autoPlay
                            muted
                            className="w-100 rounded-3 shadow mb-3"
                            style={{ maxWidth: '320px', minWidth: '200px', background: '#222', height: '220px', objectFit: 'cover' }}
                        ></video>
                        <div className="w-100 text-center mt-3">
                            <button
                                onClick={isRecording ? handleStopRecording : handleStartRecording}
                                disabled={isLoading || auntyIsSpeaking}
                                className={`px-4 py-3 fs-5 fw-bold text-white rounded-pill shadow-lg transition-all ${isRecording ? 'bg-danger' : 'bg-success'} ${isLoading || auntyIsSpeaking ? 'opacity-50' : ''}`}
                            >
                                {isRecording ? 'Stop Talking' : 'Talk to Aunty'}
                            </button>
                            <p className="mt-3 small text-secondary" style={{ minHeight: '1.5em' }}>
                                {isLoading ? "Aunty is thinking..." : status}
                            </p>
                        </div>
                        <div className="overflow-auto bg-white p-3 rounded-3 border border-1 border-secondary ms-auto w-75 mx-auto" style={{ height: '16rem' }}>
                            {conversation.length === 0 && (
                                <div className="text-center text-muted">
                                    Conversation will appear here...
                                </div>
                            )}
                            {conversation.map((entry, index) => (
                                <div
                                    key={index}
                                    className={`mb-3 p-2 rounded-3 ${entry.speaker === 'aunty' ? 'bg-danger-subtle text-start' : 'bg-success-subtle text-end'}`}
                                >
                                    <p className="small fw-bold text-capitalize mb-1">
                                        {entry.speaker === 'aunty' ? 'Aunty says:' : 'You said:'}
                                    </p>
                                    <p className="mb-0">{entry.text || "I was just listening..."}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                    <audio ref={audioPlayerRef} className="d-none" />
                </div>
                <footer className="text-center mt-4 text-muted small">
                    <p>Made with passive-aggressive concern. All comparisons to your cousins are purely intentional.</p>
                </footer>
            </div>
        </div>
    );
}