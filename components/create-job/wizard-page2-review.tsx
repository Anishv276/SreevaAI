"use client";
import { useMemo, useState } from "react";
import { Plus, Trash2, Pencil, Check, X, Code2, Database, MessageSquareText } from "lucide-react";
import type { BankQuestion } from "@/lib/question-bank/types";

interface WizardPage2Props {
    questions: BankQuestion[];
    onChange: (questions: BankQuestion[]) => void;
    skippedQuerySnippetReason?: string | null;
    skippedCodeSnippetReason?: string | null;
}

function typeMeta(type: BankQuestion["question_type"]) {
    switch (type) {
        case "snippet_code":
            return { label: "Code Snippet", Icon: Code2, color: "#4338CA", bg: "#EEF2FF", border: "#C7D2FE" };
        case "snippet_query":
            return { label: "Query Snippet", Icon: Database, color: "#A21CAF", border: "#F0ABFC", bg: "#FDF4FF" };
        case "custom":
            return { label: "Custom", Icon: MessageSquareText, color: "#B45309", border: "#FDE68A", bg: "#FFFBEB" };
        default:
            return { label: "Conceptual", Icon: MessageSquareText, color: "#374151", border: "#E5E7EB", bg: "#F9FAFB" };
    }
}

export function WizardPage2Review({ questions, onChange, skippedQuerySnippetReason, skippedCodeSnippetReason }: WizardPage2Props) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editText, setEditText] = useState("");
    const [showAddForm, setShowAddForm] = useState(false);
    const [newSkill, setNewSkill] = useState("");
    const [newSubtopic, setNewSubtopic] = useState("");
    const [newType, setNewType] = useState<BankQuestion["question_type"]>("conceptual");
    const [newQuestion, setNewQuestion] = useState("");

    const grouped = useMemo(() => {
        const bySkill = new Map<string, BankQuestion[]>();
        for (const q of questions) {
            const list = bySkill.get(q.skill) || [];
            list.push(q);
            bySkill.set(q.skill, list);
        }
        return Array.from(bySkill.entries());
    }, [questions]);

    const generatedCount = questions.filter((q) => q.source === "generated").length;

    const startEdit = (q: BankQuestion) => {
        setEditingId(q.id);
        setEditText(q.question);
    };

    const saveEdit = (id: string) => {
        onChange(questions.map((q) => (q.id === id ? { ...q, question: editText, edited: true } : q)));
        setEditingId(null);
        setEditText("");
    };

    const removeQuestion = (id: string) => {
        onChange(questions.filter((q) => q.id !== id));
    };

    const addCustomQuestion = () => {
        const question = newQuestion.trim();
        const skill = newSkill.trim() || "General";
        const subtopic = newSubtopic.trim() || "General";
        if (!question) return;
        const custom: BankQuestion = {
            id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            skill,
            subtopic,
            question_type: newType,
            question,
            level: questions[0]?.level ?? 2,
            source: "custom",
            edited: false,
        };
        onChange([...questions, custom]);
        setNewQuestion("");
        setNewSkill("");
        setNewSubtopic("");
        setNewType("conceptual");
        setShowAddForm(false);
    };

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm font-semibold text-gray-900">Generated Questions</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                        {generatedCount} generated{questions.length > generatedCount ? ` + ${questions.length - generatedCount} custom` : ""} · grouped by skill
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setShowAddForm((v) => !v)}
                    className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-xs font-medium text-white transition-all"
                    style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: "0 2px 8px rgba(124,58,237,0.25)" }}
                >
                    <Plus className="h-3.5 w-3.5" /> Add custom question
                </button>
            </div>

            {skippedCodeSnippetReason && skippedQuerySnippetReason && (
                <div className="rounded-xl px-4 py-3 text-xs text-red-700" style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}>
                    This JD has neither a code-snippet nor a query-snippet question -- it may not be a genuinely
                    technical role. Please review before publishing.
                </div>
            )}
            {skippedQuerySnippetReason && (
                <div className="rounded-xl px-4 py-3 text-xs text-amber-700" style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}>
                    No query-snippet question was generated: {skippedQuerySnippetReason}
                </div>
            )}
            {skippedCodeSnippetReason && (
                <div className="rounded-xl px-4 py-3 text-xs text-amber-700" style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}>
                    No code-snippet question was generated: {skippedCodeSnippetReason}
                </div>
            )}

            {showAddForm && (
                <div className="rounded-xl p-4 space-y-3" style={{ border: "1px solid #E9E7FF", background: "#FAFAFC" }}>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                            value={newSkill}
                            onChange={(e) => setNewSkill(e.target.value)}
                            placeholder="Skill (e.g. Python)"
                            className="h-9 px-3 rounded-lg bg-white text-sm outline-none"
                            style={{ border: "1px solid #E9E7FF" }}
                        />
                        <input
                            value={newSubtopic}
                            onChange={(e) => setNewSubtopic(e.target.value)}
                            placeholder="Subtopic (e.g. Memory Management)"
                            className="h-9 px-3 rounded-lg bg-white text-sm outline-none"
                            style={{ border: "1px solid #E9E7FF" }}
                        />
                        <select
                            value={newType}
                            onChange={(e) => setNewType(e.target.value as BankQuestion["question_type"])}
                            className="h-9 px-3 rounded-lg bg-white text-sm outline-none"
                            style={{ border: "1px solid #E9E7FF" }}
                        >
                            <option value="conceptual">Conceptual</option>
                            <option value="snippet_code">Code Snippet (Live)</option>
                            <option value="snippet_query">Query Snippet (Live)</option>
                        </select>
                    </div>
                    <input
                        value={newQuestion}
                        onChange={(e) => setNewQuestion(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addCustomQuestion()}
                        placeholder={newType === "conceptual" ? "Question or concept scenario to test…" : "Descriptive intent for live code/query generation…"}
                        className="w-full h-9 px-3 rounded-lg bg-white text-sm outline-none"
                        style={{ border: "1px solid #E9E7FF" }}
                    />
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setShowAddForm(false)} className="h-8 px-3 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-100">
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={addCustomQuestion}
                            disabled={!newQuestion.trim()}
                            className="h-8 px-3.5 rounded-lg text-xs font-medium text-white disabled:opacity-40"
                            style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)" }}
                        >
                            Add question
                        </button>
                    </div>
                </div>
            )}

            <div className="space-y-5">
                {grouped.map(([skill, qs]) => (
                    <div key={skill} className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{skill}</p>
                        <div className="space-y-2">
                            {qs.map((q) => {
                                const meta = typeMeta(q.question_type);
                                const isEditing = editingId === q.id;
                                return (
                                    <div key={q.id} className="rounded-xl p-3.5 bg-white" style={{ border: "1px solid #E9E7FF" }}>
                                        <div className="flex items-start gap-3">
                                            <span
                                                className="inline-flex items-center gap-1 h-6 px-2 rounded-full text-[10px] font-medium flex-shrink-0"
                                                style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}
                                            >
                                                <meta.Icon className="h-3 w-3" /> {meta.label}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[11px] text-gray-400 mb-1">{q.subtopic}</p>
                                                {isEditing ? (
                                                    <textarea
                                                        autoFocus
                                                        value={editText}
                                                        onChange={(e) => setEditText(e.target.value)}
                                                        className="w-full text-sm text-gray-800 rounded-lg px-2.5 py-1.5 outline-none resize-none"
                                                        style={{ border: "1px solid #C4B5FD" }}
                                                        rows={2}
                                                    />
                                                ) : (
                                                    <p className="text-sm text-gray-700 leading-snug">{q.question}</p>
                                                )}
                                                {q.snippet && (
                                                    <pre className="mt-2 text-[11px] bg-gray-50 rounded-lg p-2.5 overflow-x-auto" style={{ border: "1px solid #F0EEF8" }}>
                                                        <code>{q.snippet}</code>
                                                    </pre>
                                                )}
                                                {q.edited && <span className="text-[10px] text-violet-500 mt-1 inline-block">Edited</span>}
                                            </div>
                                            <div className="flex items-center gap-1 flex-shrink-0">
                                                {isEditing ? (
                                                    <>
                                                        <button type="button" onClick={() => saveEdit(q.id)} className="h-7 w-7 rounded-lg flex items-center justify-center text-emerald-600 hover:bg-emerald-50">
                                                            <Check className="h-3.5 w-3.5" />
                                                        </button>
                                                        <button type="button" onClick={() => setEditingId(null)} className="h-7 w-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100">
                                                            <X className="h-3.5 w-3.5" />
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button type="button" onClick={() => startEdit(q)} className="h-7 w-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-violet-600 hover:bg-violet-50">
                                                            <Pencil className="h-3.5 w-3.5" />
                                                        </button>
                                                        <button type="button" onClick={() => removeQuestion(q.id)} className="h-7 w-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50">
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
