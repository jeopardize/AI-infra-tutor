"use client";

import type { RefObject } from "react";
import type { ResumeData, SectionId } from "@/lib/resume";

interface Props {
  data: ResumeData;
  isPrinting: boolean;
  previewRef?: RefObject<HTMLDivElement | null>;
}

const PRINT_STYLES = `
@media print {
  body * { visibility: hidden !important; }
  .resume-print-root, .resume-print-root * { visibility: visible !important; }
  .resume-print-root {
    position: fixed !important;
    left: 0 !important;
    top: 0 !important;
    width: 210mm !important;
    height: auto !important;
    margin: 0 !important;
    padding: 0 !important;
    box-shadow: none !important;
    border-radius: 0 !important;
  }
  @page { margin: 0; size: A4 portrait; }
  .resume-section { page-break-inside: avoid; }
}
`;

export function ResumePreview({ data, isPrinting, previewRef }: Props) {
  const { marginMm, lineSpacing } = data.settings;
  const { personalInfo: p } = data;

  function renderSection(sectionId: SectionId): React.ReactNode {
    switch (sectionId) {
      case "personalInfo":
        return (
          <div key="personalInfo">
            {/* Name & Title */}
            <div style={{ textAlign: "center", marginBottom: "4mm" }}>
              <h1 style={{ fontSize: "20pt", fontWeight: 700, margin: 0, letterSpacing: "0.05em" }}>
                {p.name || "你的姓名"}
              </h1>
              {p.jobTarget && (
                <div style={{ fontSize: "11pt", color: "#555", marginTop: "1mm" }}>
                  {p.jobTarget}
                </div>
              )}
            </div>

            {/* Contact */}
            {(p.phone || p.email) && (
              <div
                style={{
                  textAlign: "center",
                  fontSize: "9.5pt",
                  color: "#444",
                  marginBottom: "3mm",
                }}
              >
                {[p.phone, p.email].filter(Boolean).join("  |  ")}
              </div>
            )}

            {/* Summary */}
            {p.summary && (
              <div className="resume-section" style={{ marginBottom: "3mm" }}>
                <SectionTitle text="个人简介 / Summary" />
                <p style={{ margin: "1mm 0 0", fontSize: "10pt", lineHeight: lineSpacing, color: "#333" }}>
                  {p.summary}
                </p>
              </div>
            )}

            {/* Links */}
            {p.links && (
              <div className="resume-section" style={{ marginBottom: "3mm" }}>
                <SectionTitle text="链接 / Links" />
                <div style={{ fontSize: "9.5pt", color: "#2563eb", marginTop: "1mm" }}>
                  {p.links.split("\n").filter(Boolean).map((link, i) => (
                    <div key={i}>{link}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      case "education":
        return data.education.length > 0 ? (
          <div key="education" className="resume-section" style={{ marginBottom: "3mm" }}>
            <SectionTitle text="学历 / Education" />
            {data.education.map((edu) => (
              <div key={edu.id} style={{ marginTop: "1.5mm" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <strong style={{ fontSize: "10.5pt" }}>
                    {edu.school || "学校"}
                  </strong>
                  <span style={{ fontSize: "9pt", color: "#666", whiteSpace: "nowrap", marginLeft: "4mm" }}>
                    {edu.startDate} — {edu.endDate}
                  </span>
                </div>
                <div style={{ fontSize: "9.5pt", color: "#444", marginTop: "0.5mm" }}>
                  {[edu.degree, edu.major, edu.gpa ? `GPA: ${edu.gpa}` : ""]
                    .filter(Boolean)
                    .join("  |  ")}
                </div>
              </div>
            ))}
          </div>
        ) : null;

      case "workExperience":
        return data.workExperience.length > 0 ? (
          <div key="workExperience" className="resume-section" style={{ marginBottom: "3mm" }}>
            <SectionTitle text="工作经历 / Work Experience" />
            {data.workExperience.map((exp) => (
              <div key={exp.id} style={{ marginTop: "2mm" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <strong style={{ fontSize: "10.5pt" }}>
                    {exp.company || "公司"}
                  </strong>
                  <span style={{ fontSize: "9pt", color: "#666", whiteSpace: "nowrap", marginLeft: "4mm" }}>
                    {exp.startDate} — {exp.endDate}
                  </span>
                </div>
                {(exp.department || exp.position) && (
                  <div style={{ fontSize: "9.5pt", color: "#555", marginTop: "0.5mm" }}>
                    {[exp.department, exp.position].filter(Boolean).join("  |  ")}
                  </div>
                )}
                {exp.description && (
                  <RenderDescription text={exp.description} lineSpacing={lineSpacing} />
                )}
              </div>
            ))}
          </div>
        ) : null;

      case "projectExperience":
        return data.projectExperience.length > 0 ? (
          <div key="projectExperience" className="resume-section" style={{ marginBottom: "3mm" }}>
            <SectionTitle text="项目经历 / Projects" />
            {data.projectExperience.map((proj) => (
              <div key={proj.id} style={{ marginTop: "2mm" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <strong style={{ fontSize: "10.5pt" }}>
                    {proj.name || "项目名称"}
                  </strong>
                  <span style={{ fontSize: "9pt", color: "#666", whiteSpace: "nowrap", marginLeft: "4mm" }}>
                    {proj.startDate} — {proj.endDate}
                  </span>
                </div>
                {proj.role && (
                  <div style={{ fontSize: "9.5pt", color: "#555", marginTop: "0.5mm" }}>
                    {proj.role}
                  </div>
                )}
                {proj.description && (
                  <RenderDescription text={proj.description} lineSpacing={lineSpacing} />
                )}
              </div>
            ))}
          </div>
        ) : null;

      case "skills":
        return data.skills ? (
          <div key="skills" className="resume-section" style={{ marginBottom: "3mm" }}>
            <SectionTitle text="专业技能 / Skills" />
            <RenderDescription text={data.skills} lineSpacing={lineSpacing} />
          </div>
        ) : null;

      case "research":
        return data.research.length > 0 ? (
          <div key="research" className="resume-section" style={{ marginBottom: "3mm" }}>
            <SectionTitle text="科研成果 / Research" />
            {data.research.map((r) => (
              <div key={r.id} style={{ marginTop: "1.5mm" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <strong style={{ fontSize: "10.5pt" }}>
                    {r.title || "成果名称"}
                  </strong>
                  {r.date && (
                    <span style={{ fontSize: "9pt", color: "#666", whiteSpace: "nowrap", marginLeft: "4mm" }}>
                      {r.date}
                    </span>
                  )}
                </div>
                {r.venue && (
                  <div style={{ fontSize: "9.5pt", color: "#555", marginTop: "0.5mm" }}>
                    {r.venue}
                  </div>
                )}
                {r.description && (
                  <RenderDescription text={r.description} lineSpacing={lineSpacing} />
                )}
              </div>
            ))}
          </div>
        ) : null;

      case "honors":
        return data.honors.length > 0 ? (
          <div key="honors" className="resume-section" style={{ marginBottom: "3mm" }}>
            <SectionTitle text="获得荣誉 / Honors" />
            {data.honors.map((h) => (
              <div key={h.id} style={{ marginTop: "1.5mm", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: "10pt", color: "#333" }}>
                  {h.name || "荣誉名称"}
                </span>
                {h.date && (
                  <span style={{ fontSize: "9pt", color: "#666", whiteSpace: "nowrap", marginLeft: "4mm" }}>
                    {h.date}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : null;

      case "settings":
        return null; // settings is editor-only, not previewed
    }
  }

  const visibleSections = data.sectionOrder.filter((s) => s !== "settings");

  return (
    <>
      <style>{PRINT_STYLES}</style>
      <div
        ref={previewRef}
        className={`resume-print-root bg-white text-black ${
          isPrinting ? "" : "shadow-lg rounded-lg mx-auto"
        }`}
        style={{
          width: "210mm",
          minHeight: "297mm",
          padding: `${marginMm}mm`,
          lineHeight: lineSpacing,
          fontFamily:
            "'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans SC',sans-serif",
          fontSize: "11pt",
          boxSizing: "border-box",
          overflow: "hidden",
        }}
      >
        {visibleSections.map((sectionId) => renderSection(sectionId))}
      </div>
    </>
  );
}

function SectionTitle({ text }: { text: string }) {
  return (
    <div
      style={{
        fontSize: "11pt",
        fontWeight: 600,
        borderBottom: "1.5px solid #333",
        paddingBottom: "0.5mm",
        marginBottom: "0",
      }}
    >
      {text}
    </div>
  );
}

/** 将描述文本中的 bullet 行（以 - 或 * 开头）渲染为 <ul><li>，其余行渲染为 <p> */
function RenderDescription({ text, lineSpacing }: { text: string; lineSpacing: number }) {
  const lines = text.split("\n").filter(Boolean);
  const groups: Array<{ type: "bullet" | "text"; items: string[] }> = [];
  let current: typeof groups[0] | null = null;

  for (const line of lines) {
    const bulletMatch = line.match(/^[-*]\s+(.+)/);
    if (bulletMatch) {
      if (!current || current.type !== "bullet") {
        current = { type: "bullet", items: [] };
        groups.push(current);
      }
      current.items.push(bulletMatch[1]);
    } else {
      if (!current || current.type !== "text") {
        current = { type: "text", items: [] };
        groups.push(current);
      }
      current.items.push(line);
    }
  }

  return (
    <div style={{ marginTop: "0.5mm" }}>
      {groups.map((g, gi) =>
        g.type === "bullet" ? (
          <ul key={gi} style={{ margin: "0.3mm 0", paddingLeft: "4mm", listStyle: "disc" }}>
            {g.items.map((item, li) => (
              <li
                key={li}
                style={{
                  fontSize: "9.5pt",
                  lineHeight: lineSpacing,
                  color: "#333",
                  marginBottom: "0.2mm",
                }}
              >
                {item}
              </li>
            ))}
          </ul>
        ) : (
          <p
            key={gi}
            style={{
              fontSize: "9.5pt",
              margin: "0.3mm 0",
              lineHeight: lineSpacing,
              color: "#333",
            }}
          >
            {g.items.join("\n")}
          </p>
        ),
      )}
    </div>
  );
}
