import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ArrowDown, GripVertical, Trash2 } from "lucide-react";
import { useState } from "react";

export function WorkflowTimeline() {
    const [rounds, setRounds] = useState([
        { id: 1, name: "AI Resume Screening", type: "Automated", passCriteria: "Top 50%" },
        { id: 2, name: "Technical Interview", type: "Test", passCriteria: "Score > 70%" },
        { id: 3, name: "Video Interview", type: "Video", passCriteria: "AI Score > 60%" },
        { id: 4, name: "Final HR Round", type: "Manual", passCriteria: "Selection" },
    ]);

    return (
        <div className="grid gap-10 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Hiring Rounds</h3>
                    <Button variant="outline" size="sm">Add Custom Round</Button>
                </div>

                <div className="space-y-2">
                    {rounds.map((round, index) => (
                        <div key={round.id} className="relative group">
                            {/* Connector Line */}
                            {index < rounds.length - 1 && (
                                <div className="absolute left-6 top-10 bottom-0 w-0.5 bg-gray-200 -z-10 h-10" />
                            )}

                            <div className="flex items-center gap-4 p-4 bg-white border rounded-xl shadow-sm hover:shadow-md transition-all">
                                <div className="cursor-grab text-gray-400 hover:text-gray-600">
                                    <GripVertical className="h-5 w-5" />
                                </div>
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600 font-bold">
                                    {index + 1}
                                </div>
                                <div className="flex-1">
                                    <h4 className="font-medium">{round.name}</h4>
                                    <div className="flex items-center gap-2 text-xs text-gray-500">
                                        <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-600">{round.type}</span>
                                        <span>•</span>
                                        <span>Pass: {round.passCriteria}</span>
                                    </div>
                                </div>
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
                                    <Button size="sm" variant="ghost">Edit</Button>
                                    <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button>
                                </div>
                            </div>
                            {index < rounds.length - 1 && (
                                <div className="flex justify-center -mb-2 mt-2">
                                    <ArrowDown className="text-gray-300 h-4 w-4" />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <div className="space-y-6">
                <h3 className="text-lg font-semibold">Timeline & Notifications</h3>

                <div className="bg-gray-50 p-6 rounded-xl border space-y-4">
                    <div className="space-y-2">
                        <Label>Application Open Date</Label>
                        <Input type="date" />
                    </div>
                    <div className="space-y-2">
                        <Label>Application Close Date</Label>
                        <Input type="date" />
                    </div>
                    <div className="space-y-2">
                        <Label>Tentative Final Selection</Label>
                        <Input type="date" />
                    </div>
                </div>

                <div className="space-y-4 pt-4">
                    <h4 className="font-medium text-sm text-gray-500 uppercase tracking-wider">Notifications</h4>
                    <div className="flex items-center justify-between">
                        <Label htmlFor="notif-apply">Application Received Email</Label>
                        <Switch id="notif-apply" defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                        <Label htmlFor="notif-reject">Rejection Email</Label>
                        <Switch id="notif-reject" defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                        <Label htmlFor="notif-shortlist">Shortlist Email</Label>
                        <Switch id="notif-shortlist" defaultChecked />
                    </div>
                </div>
            </div>
        </div>
    );
}

