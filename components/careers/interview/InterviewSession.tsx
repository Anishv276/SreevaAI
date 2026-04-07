"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { 
    LiveKitRoom, 
    VideoConference, 
    useLocalParticipant, 
    useRemoteParticipants,
    useTracks,
    RoomAudioRenderer,
} from "@livekit/components-react";
import { Track, Participant, RemoteParticipant, LocalParticipant } from "livekit-client";
import { Mic, CheckCircle2, User, Sparkles, Loader2, StopCircle, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface InterviewSessionProps {
    applicationId: string;
    token: string; // The LiveKit token
    url: string;   // The LiveKit server URL
    candidateName: string;
    onEnd: () => void;
}

export function InterviewSession({ applicationId, token, url, candidateName, onEnd }: InterviewSessionProps) {
    const [connecting, setConnecting] = useState(true);
    const [error, setError] = useState<string | null>(null);

    return (
        <LiveKitRoom
            token={token}
            serverUrl={url}
            connect={true}
            audio={true}
            video={true}
            onDisconnected={onEnd}
            onError={(e) => {
                console.error("LiveKit error:", e);
                setError(e.message);
            }}
            onConnected={() => setConnecting(false)}
            className="min-h-screen bg-[#FDFCFB]"
        >
            <AnimatePresence>
                {connecting && (
                    <motion.div 
                        initial={{ opacity: 1 }} 
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-[#FDFCFB] flex flex-col items-center justify-center gap-6"
                    >
                        <div className="h-20 w-20 rounded-3xl bg-orange-50 flex items-center justify-center">
                            <Loader2 className="h-10 w-10 text-[#F97316] animate-spin" />
                        </div>
                        <div className="text-center space-y-2">
                            <p className="font-black text-gray-900 text-lg">Connecting to Interviewer...</p>
                            <p className="text-sm text-gray-400 font-medium tracking-wide uppercase">AI IS JOINING THE ROOM</p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {error ? (
                <div className="flex flex-col items-center justify-center h-screen gap-4">
                    <p className="text-red-500 font-bold">Failed to connect: {error}</p>
                    <Button onClick={() => window.location.reload()}>Retry</Button>
                </div>
            ) : (
                <InterviewLayout applicationId={applicationId} candidateName={candidateName} onEnd={onEnd} />
            )}
        </LiveKitRoom>
    );
}

function InterviewLayout({ applicationId, candidateName, onEnd }: { applicationId: string; candidateName: string; onEnd: () => void }) {
    const { localParticipant } = useLocalParticipant();
    const remoteParticipants = useRemoteParticipants();
    const [isThinking, setIsThinking] = useState(false);
    
    // Find the AI participant (usually named "ai_interviewer")
    const aiParticipant = remoteParticipants.find(p => p.identity.includes("ai_interviewer") || p.name?.includes("ai"));

    // Send "user_ready" signal IMMEDIATELY once connected so AI starts talking
    useEffect(() => {
        if (localParticipant) {
            console.log("Sending ready signal to AI...");
            const data = new TextEncoder().encode(JSON.stringify({ type: "user_ready" }));
            // Reliable delivery to ensure AI gets it
            localParticipant.publishData(data, { reliable: true });
        }
    }, [localParticipant]);

    // Boost AI Audio volume by 2.5x - More robust attach/detach
    useEffect(() => {
        if (!aiParticipant) return;

        const handleAudioTrack = (track: Track) => {
            if (track.kind === Track.Kind.Audio) {
                const mediaStream = track.mediaStream;
                if (!mediaStream) return;
                
                console.log("Applying 2.5x volume boost to AI...");
                const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                if (audioCtx.state === "suspended") audioCtx.resume();
                
                const source = audioCtx.createMediaStreamSource(mediaStream);
                const gainNode = audioCtx.createGain();
                gainNode.gain.value = 2.5;
                
                gainNode.connect(audioCtx.destination);
                source.connect(gainNode);

                return () => {
                    audioCtx.close();
                };
            }
        };

        aiParticipant.on(Participant.Event.TrackSubscribed, handleAudioTrack);
        // Also check if track is already subscribed
        aiParticipant.tracks.forEach((trackPub) => {
            if (trackPub.track) handleAudioTrack(trackPub.track);
        });

        return () => {
            aiParticipant.off(Participant.Event.TrackSubscribed, handleAudioTrack);
        };
    }, [aiParticipant]);

    return (
        <div className="flex flex-col h-screen overflow-hidden lg:flex-row">
            {/* Left Column: AI Interface */}
            <div className="flex-1 bg-white flex flex-col items-center justify-center p-8 relative">
                <div className="max-w-md w-full text-center space-y-8">
                    {/* Pulsing AI Circle */}
                    <div className="relative mx-auto">
                        <motion.div
                            animate={{ scale: [1, 1.1, 1] }}
                            transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                            className="h-64 w-64 rounded-full bg-orange-50 flex items-center justify-center border-2 border-orange-100 shadow-2xl overflow-hidden relative"
                        >
                            <Sparkles className="h-20 w-20 text-[#F97316]" />
                            
                            {/* Listening Waves around AI */}
                            {aiParticipant?.isSpeaking && (
                                <motion.div
                                    animate={{ 
                                        scale: [1, 1.4, 1],
                                        opacity: [0.5, 0, 0.5]
                                    }}
                                    transition={{ repeat: Infinity, duration: 2 }}
                                    className="absolute inset-0 rounded-full border-4 border-[#F97316]"
                                />
                            )}
                        </motion.div>
                        
                        {/* Thinking indicator */}
                        <AnimatePresence>
                            {(aiParticipant?.isSpeaking) && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-orange-500 text-white px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest flex items-center gap-2"
                                >
                                    <Volume2 className="h-3 w-3 animate-pulse" />
                                    AI Interviewer Speaking
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <div className="space-y-4">
                        <h2 className="text-4xl font-black text-gray-900 leading-tight">Lumoscale AI Recruiter</h2>
                        <p className="text-gray-500 font-medium max-w-sm mx-auto leading-relaxed">
                            Think of this as a conversation. I'm here to learn about your skills and experiences.
                        </p>
                    </div>
                </div>

                {/* Footer Controls */}
                <div className="absolute bottom-8 left-8 right-8 flex items-center justify-between">
                    <div className="flex items-center gap-3 bg-gray-50 px-5 py-3 rounded-2xl border border-gray-100">
                        <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest uppercase">Safe Session Active</span>
                    </div>
                    
                    <Button 
                        onClick={() => {
                            if (confirm("Are you sure you want to end the interview?")) {
                                localParticipant?.publishData(new TextEncoder().encode(JSON.stringify({ type: "interview_finished" })), { reliable: true });
                                onEnd();
                            }
                        }}
                        variant="destructive"
                        className="h-12 px-6 rounded-2xl font-black text-xs uppercase tracking-widest gap-2 bg-red-50 text-red-600 hover:bg-red-100 border-none shadow-none"
                    >
                        <StopCircle className="h-4 w-4" /> End Interview
                    </Button>
                </div>
            </div>

            {/* Right Column: Candidate View */}
            <div className="w-full lg:w-[450px] bg-gray-50 border-l border-gray-100 p-6 flex flex-col gap-6">
                {/* Video Screen */}
                <div className="relative flex-1 bg-gray-900 rounded-[40px] overflow-hidden shadow-2xl border-4 border-white">
                    <VideoTrack participant={localParticipant} />
                    
                    <div className="absolute top-6 left-6 flex items-center gap-2 px-3 py-1.5 bg-black/40 backdrop-blur-md rounded-full border border-white/10">
                        <User className="h-3.5 w-3.5 text-white" />
                        <span className="text-[10px] font-black text-white uppercase tracking-widest">{candidateName}</span>
                    </div>

                    <div className="absolute top-6 right-6 flex items-center gap-1.5 px-2.5 py-1.5 bg-red-600/80 backdrop-blur-md rounded-lg border border-red-400/20">
                        <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                        <span className="text-[9px] font-black text-white uppercase tracking-widest">Recording</span>
                    </div>
                </div>

                {/* Microphone Waves Box */}
                <div className="bg-white rounded-[40px] p-8 border border-gray-100 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Mic className="h-4 w-4 text-[#F97316]" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Microphone Input</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="h-1 w-1 rounded-full bg-[#F97316]" />
                            <span className="text-[9px] font-black text-[#F97316] uppercase tracking-widest">Active</span>
                        </div>
                    </div>
                    
                    {/* The Waveform Box */}
                    <div className="h-28 w-full bg-gray-50/50 rounded-3xl border border-gray-100 overflow-hidden relative">
                        <Waveform participant={localParticipant} />
                    </div>
                    
                    <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest text-center">
                        AI is currently analyzing your responses
                    </p>
                </div>
            </div>
            
            <RoomAudioRenderer />
        </div>
    );
}

function VideoTrack({ participant }: { participant?: LocalParticipant | Participant }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const { cameraTrack } = useTracks([Track.Source.Camera]).find(t => t.participant.identity === participant?.identity) || {};

    useEffect(() => {
        if (cameraTrack?.publication && videoRef.current) {
            cameraTrack.publication.track?.attach(videoRef.current);
        }
    }, [cameraTrack]);

    return (
        <video ref={videoRef} className="w-full h-full object-cover scale-x-[-1]" autoPlay muted playsInline />
    );
}

function Waveform({ participant }: { participant?: LocalParticipant | Participant }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animRef = useRef<number | null>(null);
    const analyzerRef = useRef<AnalyserNode | null>(null);

    useEffect(() => {
        if (!participant) return;

        const setupAudio = async () => {
            // Get local audio track
            const tracks = await participant.getTracks();
            const audioTrack = tracks.find(t => t.source === Track.Source.Microphone);
            
            if (audioTrack?.track?.mediaStream) {
                const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
                const source = ctx.createMediaStreamSource(audioTrack.track.mediaStream);
                const analyzer = ctx.createAnalyser();
                analyzer.fftSize = 2048;
                source.connect(analyzer);
                analyzerRef.current = analyzer;

                const draw = () => {
                    const canvas = canvasRef.current;
                    if (!canvas || !analyzerRef.current) return;
                    
                    const ctx = canvas.getContext("2d");
                    if (!ctx) return;

                    const bufferLength = analyzerRef.current.frequencyBinCount;
                    const dataArray = new Uint8Array(bufferLength);
                    analyzerRef.current.getByteTimeDomainData(dataArray);

                    // Auto-resize canvas
                    if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
                        canvas.width = canvas.clientWidth;
                        canvas.height = canvas.clientHeight;
                    }

                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.linearGradient(0, 0, canvas.width, 0); // Placeholder concept
                    
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = "#F97316";
                    ctx.beginPath();

                    const sliceWidth = (canvas.width * 1.0) / bufferLength;
                    let x = 0;

                    for (let i = 0; i < bufferLength; i++) {
                        const v = dataArray[i] / 128.0;
                        const y = (v * canvas.height) / 2;
                        if (i === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                        x += sliceWidth;
                    }

                    ctx.lineTo(canvas.width, canvas.height / 2);
                    ctx.stroke();
                    animRef.current = requestAnimationFrame(draw);
                };
                draw();
            }
        };

        setupAudio();
        
        return () => {
            if (animRef.current) cancelAnimationFrame(animRef.current);
        };
    }, [participant]);

    return <canvas ref={canvasRef} className="w-full h-full" />;
}
