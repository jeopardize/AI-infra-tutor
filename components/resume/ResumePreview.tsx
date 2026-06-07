"use client";

import type { RefObject } from "react";
import type { ResumeData } from "@/lib/resume";

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

        {/* Education */}
        {data.education.length > 0 && (
          <div className="resume-section" style={{ marginBottom: "3mm" }}>
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
        )}

        {/* Projects */}
        {data.projects.length > 0 && (
          <div className="resume-section">
            <SectionTitle text="项目经历 / Projects" />
            {data.projects.map((proj) => (
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
                    角色：{proj.role}
                  </div>
                )}
                {proj.techStack && (
                  <div style={{ fontSize: "9pt", color: "#666", marginTop: "0.3mm" }}>
                    技术栈：{proj.techStack}
                  </div>
                )}
                {proj.description && (
                  <p style={{ fontSize: "9.5pt", margin: "0.5mm 0 0", color: "#333", lineHeight: lineSpacing }}>
                    {proj.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
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
