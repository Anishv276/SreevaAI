"use client";

import { useState } from "react";
import { Plus, Trash2, Award, ExternalLink, Upload, FileCheck, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { PremiumMonthPicker } from "./premium-date-picker";

interface CertificationItem {
    id: string;
    name: string;
    organization: string;
    issueDate: string;
    credentialId: string;
    credentialUrl: string;
    fileUrl?: string;
    fileName?: string;
    isUploading?: boolean;
}

interface CertificationInfoProps {
    value: CertificationItem[];
    onChange: (value: CertificationItem[]) => void;
}

export function CertificationInfo({ value, onChange }: CertificationInfoProps) {
    const addCertification = () => {
        const newItem: CertificationItem = {
            id: Math.random().toString(36).substr(2, 9),
            name: "",
            organization: "",
            issueDate: "",
            credentialId: "",
            credentialUrl: ""
        };
        onChange([...value, newItem]);
    };

    const removeCertification = (id: string) => {
        onChange(value.filter(item => item.id !== id));
    };

    const updateCertification = (id: string, updates: Partial<CertificationItem>) => {
        onChange(value.map(item => item.id === id ? { ...item, ...updates } : item));
    };

    const handleFileUpload = async (id: string, file: File) => {
        updateCertification(id, { isUploading: true });
        
        try {
            const presignedRes = await fetch("/api/upload/presigned", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    fileName: file.name,
                    fileType: file.type,
                    type: "CERTIFICATION"
                })
            });

            if (!presignedRes.ok) throw new Error("Failed to get upload URL");
            
            const { uploadUrl, publicUrl } = await presignedRes.json();

            const uploadRes = await fetch(uploadUrl, {
                method: "PUT",
                headers: { "Content-Type": file.type },
                body: file
            });

            if (!uploadRes.ok) throw new Error("Upload failed");

            updateCertification(id, {
                fileName: file.name,
                fileUrl: publicUrl,
                isUploading: false
            });
        } catch (error) {
            console.error("Certification Upload Error:", error);
            updateCertification(id, { isUploading: false });
            alert("Failed to upload certification. Please try again.");
        }
    };

    const inputClass = "h-12 rounded-2xl border-gray-100 bg-gray-50/30 px-4 text-sm font-medium transition-all focus:bg-white focus:border-[#F97316] focus:ring-4 focus:ring-orange-500/10 placeholder:text-gray-300";

    return (
        <div className="space-y-10 animate-in-fade">
            <div className="space-y-6">
                {value.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 rounded-2xl border-2 border-dashed border-gray-100 bg-gray-50/20 group hover:border-[#F97316]/30 transition-all cursor-pointer"
                        onClick={addCertification}>
                        <div className="h-12 w-12 rounded-xl bg-orange-50 flex items-center justify-center text-[#F97316] mb-4 group-hover:rotate-6 transition-transform">
                            <Plus className="h-6 w-6" />
                        </div>
                        <p className="text-gray-500 font-bold text-sm">Add Certifications</p>
                        <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mt-1">Share your achievements (Optional)</p>
                    </div>
                ) : (
                    <div className="space-y-8">
                        {value.map((item, index) => (
                            <div key={item.id} className="relative group/item bg-white rounded-3xl border border-gray-100 p-8 shadow-sm hover:shadow-md transition-all">
                                <div className="absolute -top-3 left-8 px-4 py-1.5 rounded-full bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest">
                                    CERTIFICATE #{index + 1}
                                </div>
                                <button
                                    onClick={() => removeCertification(item.id)}
                                    className="absolute top-6 right-6 p-2 rounded-xl text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover/item:opacity-100"
                                >
                                    <Trash2 className="h-5 w-5" />
                                </button>
                                
                                <div className="grid gap-8 md:grid-cols-2 mt-2">
                                    <div className="space-y-3">
                                        <Label className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">Certification Name *</Label>
                                        <div className="relative">
                                            <Award className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                                            <Input
                                                placeholder="AWS Certified Solutions Architect"
                                                className={cn(inputClass, "pl-11")}
                                                value={item.name}
                                                onChange={(e) => updateCertification(item.id, { name: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <Label className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">Issuing Organization *</Label>
                                        <Input
                                            placeholder="Amazon Web Services"
                                            className={inputClass}
                                            value={item.organization}
                                            onChange={(e) => updateCertification(item.id, { organization: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="grid gap-8 md:grid-cols-2 mt-8">
                                    <PremiumMonthPicker 
                                        label="Issue Month"
                                        value={item.issueDate}
                                        onChange={(v) => updateCertification(item.id, { issueDate: v })}
                                        placeholder="Select Month"
                                    />
                                    <div className="space-y-3">
                                        <Label className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">Credential URL</Label>
                                        <div className="relative">
                                            <ExternalLink className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                                            <Input
                                                placeholder="https://..."
                                                className={cn(inputClass, "pl-11")}
                                                value={item.credentialUrl}
                                                onChange={(e) => updateCertification(item.id, { credentialUrl: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-8">
                                    <Label className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1 mb-3 block">Upload Certificate / Badge</Label>
                                    {!item.fileName ? (
                                        <div className={cn(
                                            "relative h-24 w-full rounded-2xl border-2 border-dashed border-gray-100 bg-gray-50/20 flex flex-col items-center justify-center group/upload hover:border-orange-200 transition-all",
                                            item.isUploading ? "opacity-50 cursor-wait" : "cursor-pointer"
                                        )}>
                                            {!item.isUploading && (
                                                <input 
                                                    type="file" 
                                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                                    onChange={(e) => e.target.files?.[0] && handleFileUpload(item.id, e.target.files[0])}
                                                />
                                            )}
                                            {item.isUploading ? (
                                                <>
                                                    <Loader2 className="h-6 w-6 text-[#F97316] animate-spin" />
                                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-2">Uploading to R2...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Upload className="h-6 w-6 text-gray-300 group-hover/upload:text-[#F97316] transition-colors" />
                                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-2 group-hover/upload:text-gray-900 transition-colors">Select Certificate File</span>
                                                </>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-between p-4 rounded-xl bg-orange-50/50 border border-orange-100">
                                            <div className="flex items-center gap-3">
                                                <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center text-[#F97316]">
                                                    <FileCheck className="h-5 w-5" />
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold text-gray-900 max-w-[200px] truncate">{item.fileName}</p>
                                                    <p className="text-[9px] font-black text-orange-400 uppercase tracking-widest">Certificate Attached</p>
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => updateCertification(item.id, { fileName: undefined, fileUrl: undefined })}
                                                className="h-8 w-8 rounded-lg hover:bg-orange-100 flex items-center justify-center text-orange-400 transition-colors"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        
                        <Button 
                            variant="ghost" 
                            onClick={addCertification}
                            className="w-full h-14 rounded-2xl border-2 border-dashed border-gray-100 text-gray-400 hover:text-[#F97316] hover:bg-orange-50 hover:border-[#F97316]/30 transition-all font-bold text-sm"
                        >
                            <Plus className="h-4 w-4 mr-2" /> ADD ANOTHER CERTIFICATION
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
