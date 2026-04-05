import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

export interface CustomField {
    id: number;
    label: string;
    type: string;
    required: boolean;
}

interface RegistrationProps {
    customFields: CustomField[];
    setCustomFields: (fields: CustomField[] | ((prev: CustomField[]) => CustomField[])) => void;
}

export function RegistrationForm({ customFields, setCustomFields }: RegistrationProps) {

    const addField = () =>
        setCustomFields(prev => [...prev, { id: Date.now(), label: "", type: "Text", required: false }]);

    const removeField = (id: number) =>
        setCustomFields(prev => prev.filter(f => f.id !== id));

    const updateField = (id: number, key: string, value: string | boolean) =>
        setCustomFields(prev => prev.map(f => f.id === id ? { ...f, [key]: value } : f));

    return (
        <div className="space-y-8 animate-in-fade">
            <div className="space-y-4 border p-6 rounded-xl bg-gray-50/50">
                <h3 className="text-lg font-semibold">Standard Fields</h3>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {["Full Name", "Email Address", "Phone Number", "Resume Upload", "Current Location", "Total Experience"].map((field) => (
                        <div key={field} className="flex items-center space-x-2 border p-3 rounded-lg bg-white">
                            <Checkbox id={field} defaultChecked disabled={field === "Full Name" || field === "Email Address"} />
                            <Label htmlFor={field} className="flex-1 cursor-pointer">{field}</Label>
                            <span className="text-xs text-gray-400 capitalize">{field === "Resume Upload" ? "File" : "Text"}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Custom Questions</h3>
                    <Button size="sm" onClick={addField}
                        className="bg-[#F97316] hover:bg-orange-600 text-white">
                        <Plus className="h-4 w-4 mr-2" /> Add Question
                    </Button>
                </div>

                <div className="space-y-3">
                    {customFields.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-12 rounded-2xl border-2 border-dashed border-gray-100 bg-white group hover:border-orange-200 transition-all cursor-pointer"
                             onClick={addField}>
                            <div className="h-12 w-12 rounded-xl bg-orange-50 flex items-center justify-center text-[#F97316] mb-4 group-hover:scale-110 transition-transform">
                                <Plus className="h-6 w-6" />
                            </div>
                            <p className="text-gray-500 font-bold text-sm tracking-tight">Click on "Add Question" to create your own questions</p>
                            <p className="text-gray-400 text-xs mt-1">Add links, files, or open-ended questions for candidates</p>
                        </div>
                    ) : (
                        customFields.map((field) => (
                            <div key={field.id} className="flex items-start gap-4 p-4 border rounded-xl bg-white shadow-sm hover:shadow-md transition-all">
                                <div className="flex-1 grid gap-4 md:grid-cols-3">
                                    <div className="space-y-1">
                                        <Label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Question Label</Label>
                                        <Input
                                            value={field.label}
                                            onChange={e => updateField(field.id, "label", e.target.value)}
                                            placeholder="e.g. GitHub Profile URL…"
                                            className="h-10 rounded-lg border-gray-200"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Answer Type</Label>
                                        <Select value={field.type} onValueChange={v => updateField(field.id, "type", v)}>
                                            <SelectTrigger className="h-10 rounded-lg border-gray-200">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Text">Short Text</SelectItem>
                                                <SelectItem value="Long Text">Long Text</SelectItem>
                                                <SelectItem value="File">File Upload</SelectItem>
                                                <SelectItem value="Yes/No">Yes/No</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="flex items-center gap-4 pt-6">
                                        <div className="flex items-center space-x-2">
                                            <Checkbox
                                                id={`req-${field.id}`}
                                                checked={field.required}
                                                onCheckedChange={v => updateField(field.id, "required", !!v)}
                                                className="data-[state=checked]:bg-[#F97316] data-[state=checked]:border-[#F97316]"
                                            />
                                            <Label htmlFor={`req-${field.id}`} className="text-sm font-bold text-gray-700 cursor-pointer">Required</Label>
                                        </div>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeField(field.id)}
                                    className="text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
