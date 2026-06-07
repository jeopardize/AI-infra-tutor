"use client";

import { useState, useRef } from "react";
import { useT } from "@/lib/i18n/context";
import type { ResumeData, ResumeEducation, ResumeWorkExperience, ResumeProject, ResumeResearch, ResumeHonor, SectionId } from "@/lib/resume";
import { genId } from "@/lib/resume";
import { Plus, Trash2, Sparkles, User, GraduationCap, Briefcase, Code2, Zap, FlaskConical, Award, Settings2, GripVertical } from "lucide-react";

interface Props {
  data: ResumeData;
  onChange: (data: ResumeData) => void;
  onAutoFit: () => void;
  autoFitStatus: "idle" | "fitting";
}

const INPUT_CLS =
  "w-full px-3 py-2 text-sm rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition";

const TEXTAREA_CLS = `${INPUT_CLS} resize-none`;

export function ResumeEditor({ data, onChange, onAutoFit, autoFitStatus }: Props) {
  const t = useT();

  function updatePersonal(field: keyof ResumeData["personalInfo"], value: string) {
    onChange({
      ...data,
      personalInfo: { ...data.personalInfo, [field]: value },
    });
  }

  function updateSettings(field: "marginMm" | "lineSpacing", value: number) {
    onChange({
      ...data,
      settings: { ...data.settings, [field]: value },
    });
  }

  function addEducation() {
    const newEdu: ResumeEducation = {
      id: genId(), school: "", degree: "", major: "",
      startDate: "", endDate: "", gpa: "",
    };
    onChange({ ...data, education: [...data.education, newEdu] });
  }

  function updateEducation(id: string, field: keyof ResumeEducation, value: string) {
    onChange({
      ...data,
      education: data.education.map((e) =>
        e.id === id ? { ...e, [field]: value } : e,
      ),
    });
  }

  function removeEducation(id: string) {
    onChange({
      ...data,
      education: data.education.filter((e) => e.id !== id),
    });
  }

  function addExperience() {
    const newExp: ResumeWorkExperience = {
      id: genId(), company: "", department: "", position: "",
      startDate: "", endDate: "", description: "",
    };
    onChange({ ...data, workExperience: [...data.workExperience, newExp] });
  }

  function updateExperience(id: string, field: keyof ResumeWorkExperience, value: string) {
    onChange({
      ...data,
      workExperience: data.workExperience.map((e) =>
        e.id === id ? { ...e, [field]: value } : e,
      ),
    });
  }

  function removeExperience(id: string) {
    onChange({
      ...data,
      workExperience: data.workExperience.filter((e) => e.id !== id),
    });
  }

  function addProject() {
    const newP: ResumeProject = {
      id: genId(), name: "", role: "", startDate: "", endDate: "", description: "",
    };
    onChange({ ...data, projectExperience: [...data.projectExperience, newP] });
  }

  function updateProject(id: string, field: keyof ResumeProject, value: string) {
    onChange({
      ...data,
      projectExperience: data.projectExperience.map((p) =>
        p.id === id ? { ...p, [field]: value } : p,
      ),
    });
  }

  function removeProject(id: string) {
    onChange({
      ...data,
      projectExperience: data.projectExperience.filter((p) => p.id !== id),
    });
  }

  function updateSkills(value: string) {
    onChange({ ...data, skills: value });
  }

  function addResearch() {
    const newR: ResumeResearch = {
      id: genId(), title: "", venue: "", date: "", description: "",
    };
    onChange({ ...data, research: [...data.research, newR] });
  }

  function updateResearch(id: string, field: keyof ResumeResearch, value: string) {
    onChange({
      ...data,
      research: data.research.map((r) =>
        r.id === id ? { ...r, [field]: value } : r,
      ),
    });
  }

  function removeResearch(id: string) {
    onChange({
      ...data,
      research: data.research.filter((r) => r.id !== id),
    });
  }

  function addHonor() {
    const newH: ResumeHonor = {
      id: genId(), name: "", date: "",
    };
    onChange({ ...data, honors: [...data.honors, newH] });
  }

  function updateHonor(id: string, field: keyof ResumeHonor, value: string) {
    onChange({
      ...data,
      honors: data.honors.map((h) =>
        h.id === id ? { ...h, [field]: value } : h,
      ),
    });
  }

  function removeHonor(id: string) {
    onChange({
      ...data,
      honors: data.honors.filter((h) => h.id !== id),
    });
  }

  function renderSection(sectionId: SectionId, isDragging: boolean): React.ReactNode {
    switch (sectionId) {
      case "personalInfo":
        return (
          <Section icon={<User className="w-4 h-4" />} label={t.resume.personalInfo} isDragging={isDragging}>
            <div className="space-y-3">
              <Field label={t.resume.name}>
                <input className={INPUT_CLS} value={data.personalInfo.name} onChange={(e) => updatePersonal("name", e.target.value)} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t.resume.phone}>
                  <input className={INPUT_CLS} value={data.personalInfo.phone} onChange={(e) => updatePersonal("phone", e.target.value)} />
                </Field>
                <Field label={t.resume.email}>
                  <input className={INPUT_CLS} type="email" value={data.personalInfo.email} onChange={(e) => updatePersonal("email", e.target.value)} />
                </Field>
              </div>
              <Field label={t.resume.jobTarget}>
                <input className={INPUT_CLS} value={data.personalInfo.jobTarget} onChange={(e) => updatePersonal("jobTarget", e.target.value)} />
              </Field>
              <Field label={t.resume.summary}>
                <textarea className={TEXTAREA_CLS} rows={3} value={data.personalInfo.summary} onChange={(e) => updatePersonal("summary", e.target.value)} />
              </Field>
              <Field label={t.resume.links} hint={t.resume.linksHint}>
                <textarea className={TEXTAREA_CLS} rows={2} value={data.personalInfo.links} onChange={(e) => updatePersonal("links", e.target.value)} />
              </Field>
            </div>
          </Section>
        );
      case "education":
        return (
          <Section icon={<GraduationCap className="w-4 h-4" />} label={t.resume.education} onAdd={addEducation} addLabel={t.resume.addEducation} isDragging={isDragging}>
            {data.education.length === 0 ? (
              <div className="text-xs text-zinc-400 text-center py-4 border border-dashed border-zinc-300 dark:border-zinc-600 rounded-lg">{t.resume.addEducation}</div>
            ) : (
              <div className="space-y-3">
                <DraggableList items={data.education} keyFn={(e) => e.id} onReorder={(items) => onChange({...data, education: items})}>
                  {(edu, _idx, entryDragging) => (
                    <EntryCard index={_idx + 1} onRemove={() => removeEducation(edu.id)} removeTitle={t.resume.removeEducation} isDragging={entryDragging}>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label={t.resume.school}><input className={INPUT_CLS} value={edu.school} onChange={(e) => updateEducation(edu.id, "school", e.target.value)} /></Field>
                        <Field label={t.resume.degree}><input className={INPUT_CLS} value={edu.degree} onChange={(e) => updateEducation(edu.id, "degree", e.target.value)} /></Field>
                      </div>
                      <Field label={t.resume.major}><input className={INPUT_CLS} value={edu.major} onChange={(e) => updateEducation(edu.id, "major", e.target.value)} /></Field>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label={t.resume.startDate}><input className={INPUT_CLS} value={edu.startDate} onChange={(e) => updateEducation(edu.id, "startDate", e.target.value)} placeholder="2020.09" /></Field>
                        <Field label={t.resume.endDate}><input className={INPUT_CLS} value={edu.endDate} onChange={(e) => updateEducation(edu.id, "endDate", e.target.value)} placeholder="2024.06" /></Field>
                      </div>
                      <Field label={t.resume.gpa}><input className={INPUT_CLS} value={edu.gpa} onChange={(e) => updateEducation(edu.id, "gpa", e.target.value)} placeholder="3.8/4.0" /></Field>
                    </EntryCard>
                  )}
                </DraggableList>
              </div>
            )}
          </Section>
        );
      case "workExperience":
        return (
          <Section icon={<Briefcase className="w-4 h-4" />} label={t.resume.workExperience} onAdd={addExperience} addLabel={t.resume.addExperience} isDragging={isDragging}>
            {data.workExperience.length === 0 ? (
              <div className="text-xs text-zinc-400 text-center py-4 border border-dashed border-zinc-300 dark:border-zinc-600 rounded-lg">{t.resume.addExperience}</div>
            ) : (
              <div className="space-y-3">
                <DraggableList items={data.workExperience} keyFn={(e) => e.id} onReorder={(items) => onChange({...data, workExperience: items})}>
                  {(exp, _idx, entryDragging) => (
                    <EntryCard index={_idx + 1} onRemove={() => removeExperience(exp.id)} removeTitle={t.resume.removeExperience} isDragging={entryDragging}>
                      <Field label={t.resume.company}><input className={INPUT_CLS} value={exp.company} onChange={(e) => updateExperience(exp.id, "company", e.target.value)} /></Field>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label={t.resume.department}><input className={INPUT_CLS} value={exp.department} onChange={(e) => updateExperience(exp.id, "department", e.target.value)} /></Field>
                        <Field label={t.resume.position}><input className={INPUT_CLS} value={exp.position} onChange={(e) => updateExperience(exp.id, "position", e.target.value)} /></Field>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label={t.resume.startDate}><input className={INPUT_CLS} value={exp.startDate} onChange={(e) => updateExperience(exp.id, "startDate", e.target.value)} placeholder="2020.07" /></Field>
                        <Field label={t.resume.endDate}><input className={INPUT_CLS} value={exp.endDate} onChange={(e) => updateExperience(exp.id, "endDate", e.target.value)} placeholder="2024.06" /></Field>
                      </div>
                      <Field label={t.resume.description} hint="每行一条，以 - 开头生成圆点">
                        <textarea className={TEXTAREA_CLS} rows={4} value={exp.description} onChange={(e) => updateExperience(exp.id, "description", e.target.value)} placeholder={"- 负责xxx模块的架构设计\n- 优化系统吞吐量提升50%"} />
                      </Field>
                    </EntryCard>
                  )}
                </DraggableList>
              </div>
            )}
          </Section>
        );
      case "projectExperience":
        return (
          <Section icon={<Code2 className="w-4 h-4" />} label={t.resume.projectExperience} onAdd={addProject} addLabel={t.resume.addProject} isDragging={isDragging}>
            {data.projectExperience.length === 0 ? (
              <div className="text-xs text-zinc-400 text-center py-4 border border-dashed border-zinc-300 dark:border-zinc-600 rounded-lg">{t.resume.addProject}</div>
            ) : (
              <div className="space-y-3">
                <DraggableList items={data.projectExperience} keyFn={(p) => p.id} onReorder={(items) => onChange({...data, projectExperience: items})}>
                  {(proj, _idx, entryDragging) => (
                    <EntryCard index={_idx + 1} onRemove={() => removeProject(proj.id)} removeTitle={t.resume.removeProject} isDragging={entryDragging}>
                      <Field label={t.resume.projectName}><input className={INPUT_CLS} value={proj.name} onChange={(e) => updateProject(proj.id, "name", e.target.value)} /></Field>
                      <Field label={t.resume.position}><input className={INPUT_CLS} value={proj.role} onChange={(e) => updateProject(proj.id, "role", e.target.value)} /></Field>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label={t.resume.startDate}><input className={INPUT_CLS} value={proj.startDate} onChange={(e) => updateProject(proj.id, "startDate", e.target.value)} placeholder="2024.01" /></Field>
                        <Field label={t.resume.endDate}><input className={INPUT_CLS} value={proj.endDate} onChange={(e) => updateProject(proj.id, "endDate", e.target.value)} placeholder="2024.06" /></Field>
                      </div>
                      <Field label={t.resume.description} hint="每行一条，以 - 开头生成圆点">
                        <textarea className={TEXTAREA_CLS} rows={4} value={proj.description} onChange={(e) => updateProject(proj.id, "description", e.target.value)} placeholder={"- 负责xxx模块的架构设计\n- 优化系统吞吐量提升50%"} />
                      </Field>
                    </EntryCard>
                  )}
                </DraggableList>
              </div>
            )}
          </Section>
        );
      case "skills":
        return (
          <Section icon={<Zap className="w-4 h-4" />} label={t.resume.skills} isDragging={isDragging}>
            <Field label={t.resume.skills} hint={t.resume.skillsHint}>
              <textarea className={TEXTAREA_CLS} rows={4} value={data.skills} onChange={(e) => updateSkills(e.target.value)} />
            </Field>
          </Section>
        );
      case "research":
        return (
          <Section icon={<FlaskConical className="w-4 h-4" />} label={t.resume.research} onAdd={addResearch} addLabel={t.resume.addResearch} isDragging={isDragging}>
            {data.research.length === 0 ? (
              <div className="text-xs text-zinc-400 text-center py-4 border border-dashed border-zinc-300 dark:border-zinc-600 rounded-lg">{t.resume.addResearch}</div>
            ) : (
              <div className="space-y-3">
                <DraggableList items={data.research} keyFn={(r) => r.id} onReorder={(items) => onChange({...data, research: items})}>
                  {(r, _idx, entryDragging) => (
                    <EntryCard index={_idx + 1} onRemove={() => removeResearch(r.id)} removeTitle={t.resume.removeResearch} isDragging={entryDragging}>
                      <Field label={t.resume.researchTitle}><input className={INPUT_CLS} value={r.title} onChange={(e) => updateResearch(r.id, "title", e.target.value)} /></Field>
                      <Field label={t.resume.researchVenue}><input className={INPUT_CLS} value={r.venue} onChange={(e) => updateResearch(r.id, "venue", e.target.value)} /></Field>
                      <Field label={t.resume.date}><input className={INPUT_CLS} value={r.date} onChange={(e) => updateResearch(r.id, "date", e.target.value)} placeholder="2024.06" /></Field>
                      <Field label={t.resume.description} hint="每行一条，以 - 开头生成圆点">
                        <textarea className={TEXTAREA_CLS} rows={3} value={r.description} onChange={(e) => updateResearch(r.id, "description", e.target.value)} />
                      </Field>
                    </EntryCard>
                  )}
                </DraggableList>
              </div>
            )}
          </Section>
        );
      case "honors":
        return (
          <Section icon={<Award className="w-4 h-4" />} label={t.resume.honors} onAdd={addHonor} addLabel={t.resume.addHonor} isDragging={isDragging}>
            {data.honors.length === 0 ? (
              <div className="text-xs text-zinc-400 text-center py-4 border border-dashed border-zinc-300 dark:border-zinc-600 rounded-lg">{t.resume.addHonor}</div>
            ) : (
              <div className="space-y-3">
                <DraggableList items={data.honors} keyFn={(h) => h.id} onReorder={(items) => onChange({...data, honors: items})}>
                  {(h, _idx, entryDragging) => (
                    <EntryCard index={_idx + 1} onRemove={() => removeHonor(h.id)} removeTitle={t.resume.removeHonor} isDragging={entryDragging}>
                      <Field label={t.resume.honorName}><input className={INPUT_CLS} value={h.name} onChange={(e) => updateHonor(h.id, "name", e.target.value)} /></Field>
                      <Field label={t.resume.date}><input className={INPUT_CLS} value={h.date} onChange={(e) => updateHonor(h.id, "date", e.target.value)} placeholder="2024" /></Field>
                    </EntryCard>
                  )}
                </DraggableList>
              </div>
            )}
          </Section>
        );
      case "settings":
        return (
          <Section icon={<Settings2 className="w-4 h-4" />} label={t.resume.settings} isDragging={isDragging}>
            <div className="space-y-4">
              <SliderField label={t.resume.margin} value={`${data.settings.marginMm}mm`} min={10} max={25} step={1} cur={data.settings.marginMm} onChange={(v) => updateSettings("marginMm", v)} />
              <SliderField label={t.resume.lineSpacing} value={data.settings.lineSpacing.toFixed(2)} min={100} max={150} step={5} cur={Math.round(data.settings.lineSpacing * 100)} onChange={(v) => updateSettings("lineSpacing", v / 100)} />
              <button onClick={onAutoFit} disabled={autoFitStatus === "fitting"} className="flex items-center justify-center gap-1.5 w-full px-3 py-2 text-sm rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-40 transition">
                <Sparkles className="w-4 h-4" />
                {autoFitStatus === "fitting" ? t.resume.autoFitting : t.resume.autoFit}
              </button>
            </div>
          </Section>
        );
    }
  }

  const draggableSections = data.sectionOrder.filter((s) => s !== "settings");

  return (
    <div className="space-y-4">
      <DraggableList items={draggableSections} keyFn={(s) => s} onReorder={(items) => onChange({...data, sectionOrder: [...items, "settings"]})}>
        {(sectionId, _idx, isDragging) => renderSection(sectionId, isDragging)}
      </DraggableList>
      {renderSection("settings", false)}
    </div>
  );
}

// ---- Drag-and-drop sortable list ----

function DraggableList<T>({
  items,
  onReorder,
  keyFn,
  children,
}: {
  items: T[];
  onReorder: (items: T[]) => void;
  keyFn: (item: T) => string;
  children: (item: T, index: number, isDragging: boolean) => React.ReactNode;
}) {
  const dragIdRef = useRef<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  function handleDragStart(e: React.DragEvent, item: T) {
    const id = keyFn(item);
    dragIdRef.current = id;
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent, targetIndex: number) {
    e.preventDefault();
    const srcId = dragIdRef.current;
    if (!srcId) return;
    const srcIdx = items.findIndex((item) => keyFn(item) === srcId);
    if (srcIdx === -1 || srcIdx === targetIndex) return;

    const next = Array.from(items);
    const [moved] = next.splice(srcIdx, 1);
    next.splice(targetIndex, 0, moved);
    dragIdRef.current = keyFn(moved);
    onReorder(next);
  }

  function handleDragEnd() {
    dragIdRef.current = null;
    setDraggedId(null);
  }

  return (
    <>
      {items.map((item, index) => (
        <div
          key={keyFn(item)}
          draggable
          onDragStart={(e) => handleDragStart(e, item)}
          onDragOver={(e) => handleDragOver(e, index)}
          onDragEnd={handleDragEnd}
        >
          {children(item, index, draggedId === keyFn(item))}
        </div>
      ))}
    </>
  );
}

// ---- Sub-components ----

function Section({
  icon,
  label,
  children,
  onAdd,
  addLabel,
  isDragging,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  onAdd?: () => void;
  addLabel?: string;
  isDragging?: boolean;
}) {
  return (
    <div className={`rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden transition-opacity ${isDragging ? "opacity-40" : ""}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          <span className="text-zinc-300 dark:text-zinc-600 cursor-grab active:cursor-grabbing">
            <GripVertical className="w-4 h-4" />
          </span>
          <span className="text-blue-600 dark:text-blue-400">{icon}</span>
          {label}
        </div>
        {onAdd && (
          <button
            onClick={onAdd}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            {addLabel}
          </button>
        )}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">{hint}</p>}
    </div>
  );
}

function EntryCard({
  index,
  onRemove,
  removeTitle,
  isDragging,
  children,
}: {
  index: number;
  onRemove: () => void;
  removeTitle: string;
  isDragging?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`relative rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/30 p-3 pt-4 space-y-3 transition-opacity ${isDragging ? "opacity-40" : ""}`}>
      <div className="flex items-center justify-between absolute top-0 left-0 right-0 px-3 py-1">
        <div className="flex items-center gap-1">
          <span className="text-zinc-300 dark:text-zinc-600 cursor-grab active:cursor-grabbing">
            <GripVertical className="w-3.5 h-3.5" />
          </span>
          <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500">#{index}</span>
        </div>
        <button
          onClick={onRemove}
          className="text-rose-400 hover:text-rose-600 dark:hover:text-rose-400 p-0.5 transition"
          title={removeTitle}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {children}
    </div>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  cur,
  onChange,
}: {
  label: string;
  value: string;
  min: number;
  max: number;
  step: number;
  cur: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={cur}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-blue-600 h-1.5 rounded-full appearance-none bg-zinc-200 dark:bg-zinc-700 cursor-pointer"
      />
    </div>
  );
}
