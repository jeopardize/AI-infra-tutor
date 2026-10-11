/**
 * 版本号与更新日志（反馈：每次重新部署以新版本发布，反馈页展示版本更新日志）。
 * 发布新版本时：递增 APP_VERSION，并在 CHANGELOG 顶部追加条目
 * （scripts/update.sh 部署时若检测到 LLM 自动润色的 pending summary，也会自动追加）。
 */

export const APP_VERSION = "1.1.0";

export interface ChangelogEntry {
  version: string;
  /** YYYY-MM-DD */
  date: string;
  items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.1.0",
    date: "2026-10-11",
    items: [
      "笔记大纲字体调大到与正文一致（0.9rem），目录支持收缩展开",
      "修复答题框换行：Markdown 渲染保留单换行（remark-breaks）",
      "作答支持文字颜色/高亮批注（自我批改），设为标准答案时保留格式",
      "新增 Light/Dark 主题手动切换（顶栏按钮，记忆偏好，默认跟随系统）",
      "反馈页新增「版本更新日志」；已处理意见可一键清除或单独删除",
      "每日自动更新改为每周日 05:00：更新前先迁移数据并同步 git 数据仓库；服务器上可手动运行 scripts/update.sh 触发更新",
      "新增数据迁移机制：服务启动与每次升级时自动执行迁移，确保已有数据无损",
    ],
  },
  {
    version: "1.0.5",
    date: "2026-10-08",
    items: [
      "Markdown 支持 [!important]/[!Note] callout 提示块",
      "反馈已处理标记走 git 数据仓库（修复刷新回退）；笔记库支持拖动文件/文件夹",
      "笔记大纲可收缩、可上下伸缩；抽屉可拉宽",
    ],
  },
  {
    version: "1.0.4",
    date: "2026-10-06",
    items: [
      "已处理反馈可一键清除；笔记库文件夹排序与重命名",
      "新增题界面改文件夹树选分类；新增收藏错题本（<60 分自动收藏 + 手动收藏）",
      "题库拖拽换分类/文件内排序、页内新建文件夹、Markdown 题卡渲染",
    ],
  },
  {
    version: "1.0.3",
    date: "2026-10-05",
    items: [
      "每日题目卡片式展开答题 + 后台批改 + 跨页面状态保留",
      "题库分类改为文件夹树；推送时间改为 8 点；版本发布改为周日",
    ],
  },
  {
    version: "1.0.2",
    date: "2026-09-28",
    items: [
      "题库文件化到笔记库 question.md；答题卡片对比标准答案 + AI 解析 + 设为标准答案",
      "答题历史服务端持久化（git 仓库 + 半年自动清理）；每日企业微信推送",
    ],
  },
];
