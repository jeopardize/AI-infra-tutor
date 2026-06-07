"use client";

// -------- Types --------

export const DEFAULT_SECTION_ORDER = [
  "personalInfo",
  "education",
  "workExperience",
  "projectExperience",
  "skills",
  "research",
  "honors",
  "settings",
] as const;

export type SectionId = (typeof DEFAULT_SECTION_ORDER)[number];

export interface ResumePersonalInfo {
  name: string;
  phone: string;
  email: string;
  jobTarget: string;
  summary: string;
  links: string;
}

export interface ResumeEducation {
  id: string;
  school: string;
  degree: string;
  major: string;
  startDate: string;
  endDate: string;
  gpa: string;
}

export interface ResumeWorkExperience {
  id: string;
  company: string;
  department: string;
  position: string;
  startDate: string;
  endDate: string;
  description: string;
}

export interface ResumeProject {
  id: string;
  name: string;
  role: string;
  startDate: string;
  endDate: string;
  description: string;
}

export interface ResumeResearch {
  id: string;
  title: string;
  venue: string;
  date: string;
  description: string;
}

export interface ResumeHonor {
  id: string;
  name: string;
  date: string;
}

export interface ResumeSettings {
  marginMm: number; // 10-25
  lineSpacing: number; // 1.0-1.5
}

export interface ResumeData {
  personalInfo: ResumePersonalInfo;
  education: ResumeEducation[];
  workExperience: ResumeWorkExperience[];
  projectExperience: ResumeProject[];
  skills: string;
  research: ResumeResearch[];
  honors: ResumeHonor[];
  /** @deprecated 保留用于向后兼容 */
  projects: ResumeProject[];
  settings: ResumeSettings;
  sectionOrder: SectionId[];
}

// -------- Defaults --------

const STORAGE_KEY = "ai-infra-tutor:resume:v1";

export function createDefaultResumeData(): ResumeData {
  return {
    personalInfo: {
      name: "",
      phone: "",
      email: "",
      jobTarget: "",
      summary: "",
      links: "",
    },
    education: [],
    workExperience: [],
    projectExperience: [],
    skills: "",
    research: [],
    honors: [],
    projects: [],
    settings: {
      marginMm: 20,
      lineSpacing: 1.35,
    },
    sectionOrder: [...DEFAULT_SECTION_ORDER],
  };
}

let _idCounter = Date.now();
export function genId(): string {
  return `r-${_idCounter++}-${Math.random().toString(36).slice(2, 6)}`;
}

// -------- CRUD --------

export function loadResumeData(): ResumeData {
  if (typeof window === "undefined") return createDefaultResumeData();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultResumeData();
    const parsed = JSON.parse(raw) as ResumeData;
    // Merge with defaults for schema evolution safety
    return {
      ...createDefaultResumeData(),
      ...parsed,
      personalInfo: {
        ...createDefaultResumeData().personalInfo,
        ...parsed.personalInfo,
      },
      settings: {
        ...createDefaultResumeData().settings,
        ...parsed.settings,
      },
    };
  } catch {
    return createDefaultResumeData();
  }
}

export function saveResumeData(data: ResumeData) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* quota exceeded */
  }
}

// -------- Server sync (fire-and-forget with localStorage fallback) --------

const API_DOMAIN = "resume";

/** 优先从服务端加载，服务端不可用时回退到 localStorage */
export async function serverLoadResumeData(): Promise<ResumeData> {
  try {
    const res = await fetch(`/api/data/${API_DOMAIN}`);
    if (res.ok) {
      const json = await res.json();
      if (json && !json._empty) {
        const merged: ResumeData = {
          ...createDefaultResumeData(),
          ...json,
          personalInfo: { ...createDefaultResumeData().personalInfo, ...json.personalInfo },
          settings: { ...createDefaultResumeData().settings, ...json.settings },
        };
        // Also write to localStorage for offline resilience
        if (typeof window !== "undefined") {
          try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch {}
        }
        return merged;
      }
    }
  } catch {
    /* server unavailable, fall through */
  }
  // Fallback: load from localStorage
  return loadResumeData();
}

/** 同时保存到 localStorage 和服务端 */
export async function serverSaveResumeData(data: ResumeData): Promise<void> {
  // Save to localStorage first (instant)
  saveResumeData(data);
  // Then sync to server (fire-and-forget)
  try {
    await fetch(`/api/data/${API_DOMAIN}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch {
    /* server unavailable, data is still in localStorage */
  }
}
