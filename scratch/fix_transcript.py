import os
import re

file_path = r"c:\Users\vamsi\OneDrive\Desktop\HR-updates\app\interview\[id]\page.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Pattern to find the existing transcript block
pattern = r'(?s)\s*\{\/\* Floating Vanishing Transcript - Beside Avatar \*\/\}\s*<div className="absolute left-\[calc\(50%\+160px\)\] bottom-\[45%\] z-\[65\] w-\[400px\] pointer-events-none">.*?<\/div>\s*<\/div>'

replacement = """
                {/* Floating Vanishing Transcript - Bottom Left Anchor */}
                <div className="absolute left-16 bottom-24 z-[65] w-[550px] pointer-events-none">
                    <div 
                        className="flex flex-col-reverse gap-8"
                        style={{ 
                            maskImage: 'linear-gradient(to top, black 20%, transparent 100%)',
                            WebkitMaskImage: 'linear-gradient(to top, black 20%, transparent 100%)'
                        }}
                    >
                        <AnimatePresence mode="popLayout">
                            {groupedTranscriptions.slice(-5).reverse().map((group, idx) => {
                                const isGroupFinal = group.segments.every(s => s.isFinal);
                                const combinedText = group.segments.map(s => s.text.trim()).join(" ");
                                
                                return (
                                    <motion.div
                                        key={group.id}
                                        initial={{ opacity: 0, y: 30, scale: 0.95 }}
                                        animate={{ 
                                            opacity: Math.max(0.1, 1 - (idx * 0.2)),
                                            y: 0, 
                                            scale: 1 
                                        }}
                                        exit={{ 
                                            opacity: 0, 
                                            y: -80, 
                                            scale: 0.9, 
                                            transition: { duration: 0.8, ease: "easeInOut" } 
                                        }}
                                        transition={{ 
                                            type: "spring",
                                            stiffness: 100,
                                            damping: 20,
                                            mass: 0.6
                                        }}
                                        className="flex flex-col gap-1.5"
                                    >
                                        <p className={cn(
                                            "text-[10px] font-black uppercase tracking-[0.4em] ml-1 drop-shadow-md",
                                            group.isCandidate ? "text-orange-500" : "text-zinc-500"
                                        )}>
                                            {group.speakerName}{!isGroupFinal && <span className="opacity-50 ml-1">•••</span>}
                                        </p>
                                        <div className="relative group">
                                            <StreamingText 
                                                text={combinedText} 
                                                className={cn(
                                                    "text-4xl font-black italic tracking-tighter leading-[1.05] drop-shadow-[0_4px_12px_rgba(0,0,0,0.4)]",
                                                    group.isCandidate ? "text-orange-100" : "text-white"
                                                )} 
                                            />
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>
                </div>
            </div>"""

if re.search(pattern, content):
    new_content = re.sub(pattern, replacement, content)
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(new_content)
    print("Successfully replaced transcript block.")
else:
    print("Could not find the transcript block pattern.")
