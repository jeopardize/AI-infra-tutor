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

      case "education": {
        const visible = data.education.filter((e) => !e.hidden);
        return visible.length > 0 ? (
          <div key="education" className="resume-section" style={{ marginBottom: "3mm" }}>
            <SectionTitle text="学历 / Education" />
            {visible.map((edu) => (
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
      }

      case "workExperience": {
        const visible = data.workExperience.filter((e) => !e.hidden);
        return visible.length > 0 ? (
          <div key="workExperience" className="resume-section" style={{ marginBottom: "3mm" }}>
            <SectionTitle text="工作经历 / Work Experience" />
            {visible.map((exp) => (
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
      }

      case "projectExperience": {
        const visible = data.projectExperience.filter((p) => !p.hidden);
        return visible.length > 0 ? (
          <div key="projectExperience" className="resume-section" style={{ marginBottom: "3mm" }}>
            <SectionTitle text="项目经历 / Projects" />
            {visible.map((proj) => (
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
                {proj.link && (
                  <div style={{ fontSize: "9pt", color: "#2563eb", marginTop: "0.3mm" }}>
                    {proj.link}
                  </div>
                )}
                {proj.description && (
                  <RenderDescription text={proj.description} lineSpacing={lineSpacing} />
                )}
              </div>
            ))}
          </div>
        ) : null;
      }

      case "skills":
        return data.skills ? (
          <div key="skills" className="resume-section" style={{ marginBottom: "3mm" }}>
            <SectionTitle text="专业技能 / Skills" />
            <RenderDescription text={data.skills} lineSpacing={lineSpacing} />
          </div>
        ) : null;

      case "research": {
        const visible = data.research.filter((r) => !r.hidden);
        return visible.length > 0 ? (
          <div key="research" className="resume-section" style={{ marginBottom: "3mm" }}>
            <SectionTitle text="科研成果 / Research" />
            {visible.map((r) => (
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
      }

      case "honors": {
        const visible = data.honors.filter((h) => !h.hidden);
        return visible.length > 0 ? (
          <div key="honors" className="resume-section" style={{ marginBottom: "3mm" }}>
            <SectionTitle text="获得荣誉 / Honors" />
            {visible.map((h) => (
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
      }

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

/** 解析内联格式：**加粗** 和 *斜体* */
function parseInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Find **bold** first (must check before *italic* to avoid false positives)
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // Find *italic* — not preceded or followed by another *
    const italicMatch = remaining.match(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/);

    const boldIdx = boldMatch ? remaining.indexOf(boldMatch[0]) : Infinity;
    const italicIdx = italicMatch ? remaining.indexOf(italicMatch[0]) : Infinity;

    if (boldIdx === Infinity && italicIdx === Infinity) {
      nodes.push(remaining);
      break;
    }

    if (boldIdx <= italicIdx && boldMatch) {
      if (boldIdx > 0) nodes.push(remaining.slice(0, boldIdx));
      nodes.push(<strong key={key++}>{boldMatch[1]}</strong>);
      remaining = remaining.slice(boldIdx + boldMatch[0].length);
    } else if (italicMatch) {
      if (italicIdx > 0) nodes.push(remaining.slice(0, italicIdx));
      nodes.push(<em key={key++}>{italicMatch[1]}</em>);
      remaining = remaining.slice(italicIdx + italicMatch[0].length);
    }
  }

  return nodes;
}

/** 将描述文本渲染为带格式的段落和bullet列表
 * - 以 `- ` 或 `* ` 开头的行 → 主级 bullet
 * - 以 2+ 空格 + `- ` 开头的行 → 二级 bullet（嵌套缩进）
 * - 其余行 → 普通段落
 * - 行内支持 **加粗** 和 *斜体*
 */
function RenderDescription({ text, lineSpacing }: { text: string; lineSpacing: number }) {
  const lines = text.split("\n").filter(Boolean);

  type LineType = "bullet" | "sub-bullet" | "text";
  type Group = { type: LineType; items: string[] };

  const groups: Group[] = [];
  let current: Group | null = null;

  for (const line of lines) {
    const subBulletMatch = line.match(/^\s{2,}[-*]\s+(.+)/);
    const bulletMatch = !subBulletMatch && line.match(/^[-*]\s+(.+)/);

    if (subBulletMatch) {
      if (!current || current.type !== "sub-bullet") {
        // If there's a current bullet group, we embed sub-bullets in it
        // by making a new sub-bullet group
        current = { type: "sub-bullet", items: [] };
        groups.push(current);
      }
      current.items.push(subBulletMatch[1]);
    } else if (bulletMatch) {
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

  const itemStyle: React.CSSProperties = {
    fontSize: "9.5pt",
    lineHeight: lineSpacing,
    color: "#333",
    marginBottom: "0.2mm",
  };

  return (
    <div style={{ marginTop: "0.5mm" }}>
      {groups.map((g, gi) => {
        if (g.type === "bullet") {
          return (
            <ul key={gi} style={{ margin: "0.3mm 0", paddingLeft: "4mm", listStyle: "disc" }}>
              {g.items.map((item, li) => (
                <li key={li} style={itemStyle}>
                  {parseInline(item)}
                </li>
              ))}
            </ul>
          );
        }
        if (g.type === "sub-bullet") {
          return (
            <ul key={gi} style={{ margin: "0.2mm 0", paddingLeft: "8mm", listStyle: "circle" }}>
              {g.items.map((item, li) => (
                <li key={li} style={{ ...itemStyle, fontSize: "9pt" }}>
                  {parseInline(item)}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p
            key={gi}
            style={{
              fontSize: "9.5pt",
              margin: "0.3mm 0",
              lineHeight: lineSpacing,
              color: "#333",
            }}
          >
            {parseInline(g.items.join("\n"))}
          </p>
        );
      })}
    </div>
  );
}
