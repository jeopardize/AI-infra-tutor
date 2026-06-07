export type Lang = "zh" | "en";

export interface Dict {
  // -------- common --------
  common: {
    save: string;
    cancel: string;
    confirm: string;
    delete: string;
    edit: string;
    preview: string;
    close: string;
    download: string;
    export: string;
    refresh: string;
    loading: string;
    saved: string;
    unsaved: string;
    settings: string;
    restoreDefault: string;
    yes: string;
    no: string;
    retry: string;
    next: string;
  };

  // -------- header / nav --------
  nav: {
    brandSub: string; // "Tutor" tail
    dashboard: string;
    quiz: string;
    interview: string;
    library: string;
    bank: string;
    resume: string;
  };

  // -------- dashboard --------
  dashboard: {
    welcomeTitle: string;
    statsTpl: (a: { topics: number; total: number; mastered: number; gap: number }) => string;
    actionQuizTitle: string;
    actionQuizDesc: string;
    actionLearnTitle: string;
    actionLearnDesc: string;
    actionInterviewTitle: string;
    actionInterviewDesc: string;
  };

  // -------- categories (labels of the 4 directions) --------
  categories: {
    training: { label: string; description: string };
    inference: { label: string; description: string };
    hardware: { label: string; description: string };
    system: { label: string; description: string };
  };

  // -------- mastery --------
  mastery: {
    unknown: string;
    gap: string;
    learning: string;
    mastered: string;
    progressLabel: (a: { mastered: number; total: number }) => string;
    learningCount: (n: number) => string;
    gapCount: (n: number) => string;
  };

  // -------- learn page --------
  learn: {
    backToDashboard: string;
    checkpointsLabel: (n: number) => string;
    recommendedResources: string;
    myNotes: string;
    relatedMyNotes: string;
    markMastered: string;
    quizMe: string;
    commonMisconceptions: string;
    interviewAngles: string;
    chatHint: (cp: string) => string;
    chatPlaceholder: string;
  };

  // -------- chat panel --------
  chat: {
    emptyHint: string;
    send: string;
    inputPlaceholder: string;
    requestFailed: string;
    networkError: string;
  };

  // -------- quiz --------
  quiz: {
    title: string;
    subtitle: string;
    randomFromWeak: string;
    pickFromTopics: string;
    pickPlaceholder: string;
    nextQuestion: string;
    currentCheckpoint: string;
    generating: string;
    pickToStart: string;
    answerPlaceholder: string;
    submitAnswer: string;
    aiGrading: string;
    score: string;
    correctPoints: string;
    gaps: string;
    misconceptions: string;
    referenceAnswer: string;
    followUp: string;
    retryThis: string;
    reviewTopic: string;
    nextOne: string;
    knowledgeMap: string;
    generateFailed: string;
    netError: string;
    evaluateFailed: string;
  };

  // -------- interview --------
  interview: {
    title: string;
    subtitle: string;
    level: string;
    focus: string;
    duration: string;
    durationMin: (n: number) => string;
    start: string;
    historyAnalytics: (n: number) => string;
    settings: string;
    exportDirLabel: string;
    exportDirPlaceholder: string;
    exportDirHelp: string;
    avgOverall: string;
    basedOnNSessions: (n: number) => string;
    topGaps: string;
    trend: string;
    dimConceptClarity: string;
    dimSystemDesign: string;
    dimPracticalExperience: string;
    dimCommunication: string;
    interviewer: string;
    me: string;
    finishAndScore: string;
    generatingScorecard: string;
    interviewerThinking: string;
    sendShortcutHint: string;
    confirmRemoveHistory: string;
    confirmRemoveHistoryFile: string;
    scoreReport: string;
    restart: string;
    overall: string;
    strengths: string;
    weaknesses: string;
    knowledgeGaps: string;
    knowledgeGapsShort: string;
    nextSteps: string;
    nextStepsShort: string;
    gotoStudy: (name: string) => string;
    quizMeOnIt: string;
    exportMd: string;
    exportedTo: (p: string) => string;
    exportedHint: string;
    exportFailed: string;
    fromHistory: string;
    transcriptCount: (n: number) => string;
    transcriptCountShort: (n: number) => string;
    sessionId: string;
    exportingTo: string;
    libraryRoot: string;
    confirmStartFirstMsg: string;
    levels: { fresh: string; junior: string; mid: string; senior: string };
    saveScorecardFailed: (e: string) => string;
  };

  // -------- library --------
  library: {
    title: string;
    subtitle: string;
    rootHint: string;
    scanning: string;
    libNotFound: string;
    setEnvHint: string;
    newFilePrompt: (parent: string) => string;
    newDirPrompt: (parent: string) => string;
    invalidFilename: string;
    invalidDirname: string;
    createFailed: (e: string) => string;
    newFile: string;
    newDir: string;
    notPreviewable: string;
    clickToOpen: string;
  };

  // -------- DocDrawer --------
  docDrawer: {
    headerLabel: (dir: string) => string;
    rootLabel: string;
    loading: string;
    readFailed: (e: string) => string;
    emptyContent: string;
    confirmCloseUnsaved: string;
    saveOk: string;
    saveExternalConflict: string;
    saveFailed: (e: string) => string;
    reload: string;
    charsCount: (n: number) => string;
    updatedAt: (s: string) => string;
  };

  // -------- question bank --------
  bank: {
    title: string;
    subtitle: string;
    addTab: string;
    browseTab: string;
    category: string;
    categoryPlaceholder: string;
    newCategory: string;
    singleMode: string;
    batchMode: string;
    questionZh: string;
    questionEn: string;
    answerZh: string;
    answerEn: string;
    aiAutoComplete: string;
    aiAutoCompleteAll: string;
    aiCompleting: string;
    save: string;
    saveSuccess: string;
    saveFailed: string;
    batchPlaceholder: string;
    batchFormatHint: string;
    batchParseSuccess: (n: number) => string;
    batchParseFailed: string;
    search: string;
    searchPlaceholder: string;
    allCategories: string;
    exportJson: string;
    exportMarkdown: string;
    edit: string;
    delete: string;
    deleteConfirm: string;
    noQuestions: string;
    expand: string;
    collapse: string;
    copy: string;
    copied: string;
  };

  // -------- resume --------
  resume: {
    title: string;
    subtitle: string;
    personalInfo: string;
    name: string;
    phone: string;
    email: string;
    jobTarget: string;
    summary: string;
    links: string;
    linksHint: string;
    education: string;
    school: string;
    degree: string;
    major: string;
    startDate: string;
    endDate: string;
    gpa: string;
    addEducation: string;
    removeEducation: string;
    project: string;
    projectName: string;
    role: string;
    techStack: string;
    description: string;
    addProject: string;
    removeProject: string;
    settings: string;
    margin: string;
    lineSpacing: string;
    autoFit: string;
    autoFitting: string;
    exportPdf: string;
    fillTip: string;
  };
}

const zh: Dict = {
  common: {
    save: "保存",
    cancel: "取消",
    confirm: "确认",
    delete: "删除",
    edit: "编辑",
    preview: "预览",
    close: "关闭",
    download: "下载",
    export: "导出",
    refresh: "刷新",
    loading: "加载中",
    saved: "已保存",
    unsaved: "未保存",
    settings: "设置",
    restoreDefault: "还原",
    yes: "是",
    no: "否",
    retry: "重试",
    next: "下一步",
  },
  nav: {
    brandSub: "Tutor",
    dashboard: "总览",
    quiz: "查漏补缺",
    interview: "模拟面试",
    library: "笔记库",
    bank: "题库",
    resume: "简历",
  },
  dashboard: {
    welcomeTitle: "欢迎，开始你的 AI Infra 学习之旅",
    statsTpl: ({ topics, total, mastered, gap }) =>
      `共 ${topics} 个主题、${total} 个 checkpoint。已掌握 ${mastered}，盲点 ${gap}。`,
    actionQuizTitle: "查漏补缺",
    actionQuizDesc: "挑一个 checkpoint，AI 出题、批改、揭示你的盲点",
    actionLearnTitle: "开始学习",
    actionLearnDesc: "从知识点详情进入，边读边和 AI 导师对话",
    actionInterviewTitle: "模拟面试",
    actionInterviewDesc: "多轮对话式模拟，结束生成可量化的 scorecard",
  },
  categories: {
    training: { label: "训练基础设施", description: "分布式训练、并行策略、通信、显存优化" },
    inference: { label: "推理基础设施", description: "服务化、KV cache、批处理、量化、加速" },
    hardware: { label: "硬件与算子", description: "GPU 架构、CUDA、Triton、算子融合、性能分析" },
    system: { label: "系统工程", description: "调度、监控、存储、服务化、成本" },
  },
  mastery: {
    unknown: "未学",
    gap: "盲点",
    learning: "学习中",
    mastered: "已掌握",
    progressLabel: ({ mastered, total }) => `${mastered}/${total}`,
    learningCount: (n) => `学习中 ${n}`,
    gapCount: (n) => `盲点 ${n}`,
  },
  learn: {
    backToDashboard: "返回总览",
    checkpointsLabel: (n) => `CHECKPOINTS（${n}）`,
    recommendedResources: "推荐资源",
    myNotes: "我的笔记",
    relatedMyNotes: "相关的我的笔记",
    markMastered: "我已掌握",
    quizMe: "考考我",
    commonMisconceptions: "⚠️ 常见误区",
    interviewAngles: "🎙 面试常见追问",
    chatHint: (cp) => `在「${cp}」上下文中向 AI 导师提问`,
    chatPlaceholder: "试试：「能用最简单的话解释一遍吗」 / 「这里和 X 有什么区别？」",
  },
  chat: {
    emptyHint: "向 AI 导师提问吧 — 比如「能举个例子吗」「这里我没理解」",
    send: "发送",
    inputPlaceholder: "Enter 发送，Shift+Enter 换行",
    requestFailed: "请求失败",
    networkError: "网络错误",
  },
  quiz: {
    title: "查漏补缺",
    subtitle: "挑一个 checkpoint，AI 出一道开放题；写下你的答案，AI 会指出盲点并更新掌握度。",
    randomFromWeak: "从弱项随机一道",
    pickFromTopics: "从主题中选...",
    pickPlaceholder: "从主题中选...",
    nextQuestion: "换一道",
    currentCheckpoint: "当前考点",
    generating: "正在出题...",
    pickToStart: "点击上方按钮开始",
    answerPlaceholder: "把你的想法写下来——长一点更容易暴露盲点，AI 会给你详细反馈",
    submitAnswer: "提交答案",
    aiGrading: "AI 批改中...",
    score: "得分",
    correctPoints: "✓ 答到的点",
    gaps: "× 遗漏或不到位",
    misconceptions: "⚠ 概念误解",
    referenceAnswer: "📘 参考答案",
    followUp: "🔍 进阶追问",
    retryThis: "重答这题",
    reviewTopic: "回顾知识点",
    nextOne: "下一题",
    knowledgeMap: "知识掌握地图",
    generateFailed: "出题失败",
    netError: "网络错误",
    evaluateFailed: "评判失败",
  },
  interview: {
    title: "模拟面试",
    subtitle: "配置面试参数 → AI 扮演面试官 → 结束后生成可量化的 scorecard。",
    level: "目标级别",
    focus: "侧重方向（可多选）",
    duration: "计划时长",
    durationMin: (n) => `${n} 分钟`,
    start: "开始面试",
    historyAnalytics: (n) => `历史与复盘（${n}）`,
    settings: "设置",
    exportDirLabel: "面试历史导出目录",
    exportDirPlaceholder: "模拟面试历史",
    exportDirHelp: "相对于笔记库根路径（默认 ~/Documents/knowlege_library）。不存在的子目录会自动创建。",
    avgOverall: "平均总评",
    basedOnNSessions: (n) => `基于 ${n} 次完成的面试`,
    topGaps: "高频盲点（按出现次数）",
    trend: "趋势",
    dimConceptClarity: "概念清晰度",
    dimSystemDesign: "系统设计",
    dimPracticalExperience: "实战经验",
    dimCommunication: "表达",
    interviewer: "🎙 面试官",
    me: "🙋 我",
    finishAndScore: "结束并评分",
    generatingScorecard: "生成报告中...",
    interviewerThinking: "面试官思考中...",
    sendShortcutHint: "说出你的回答（Enter 发送，Shift+Enter 换行）",
    confirmRemoveHistory: "从历史中移除这条记录？",
    confirmRemoveHistoryFile: "从历史中移除这条记录？（已导出的 .md 文件不会被删除）",
    scoreReport: "面试评分报告",
    restart: "再来一场",
    overall: "总评",
    strengths: "💪 亮点",
    weaknesses: "📉 短板",
    knowledgeGaps: "📍 暴露的知识盲点（建议优先复习）",
    knowledgeGapsShort: "知识盲点",
    nextSteps: "🚀 下一步建议",
    nextStepsShort: "下一步建议",
    gotoStudy: (name) => `去学习「${name}」`,
    quizMeOnIt: "针对它做一道练习",
    exportMd: "导出 .md",
    exportedTo: (p) => `已导出到 ${p}`,
    exportedHint: "在「笔记库」里可查看",
    exportFailed: "导出失败",
    fromHistory: "📋 面试历史",
    transcriptCount: (n) => `对话全文（${n} 条）`,
    transcriptCountShort: (n) => `${n} 条对话`,
    sessionId: "会话 ID",
    exportingTo: "导出到",
    libraryRoot: "(library 根)",
    confirmStartFirstMsg: "我准备好了，请开始第一个问题。",
    levels: {
      fresh: "校招/应届",
      junior: "社招初级（1-3 年）",
      mid: "社招中级（3-5 年）",
      senior: "社招资深（5+ 年）",
    },
    saveScorecardFailed: (e) => `生成 scorecard 失败：${e}`,
  },
  library: {
    title: "我的笔记库",
    subtitle: "实时读取本地目录；在网页里编辑会直接写回对应 .md 文件。",
    rootHint: "根路径",
    scanning: "扫描中...",
    libNotFound: "笔记库目录不存在",
    setEnvHint: "可在项目根目录的 .env.local 设置 KNOWLEDGE_LIBRARY_PATH 指向你的笔记目录。",
    newFilePrompt: (parent) => `在「${parent || "(根)"}」下新建笔记。文件名（自动补 .md）：`,
    newDirPrompt: (parent) => `在「${parent || "(根)"}」下新建文件夹：`,
    invalidFilename: '文件名不能包含 / \\ < > : " | ? * 等字符',
    invalidDirname: '文件夹名不能包含 / \\ < > : " | ? * 等字符',
    createFailed: (e) => `创建失败：${e}`,
    newFile: "新建 .md 笔记",
    newDir: "新建子文件夹",
    notPreviewable: "暂不支持预览此类型",
    clickToOpen: "点击查看/编辑",
  },
  docDrawer: {
    headerLabel: (dir) => `📚 我的笔记 · ${dir || ""}`,
    rootLabel: "(根)",
    loading: "加载中...",
    readFailed: (e) => `⚠️ 无法读取：${e}`,
    emptyContent: "（这个笔记还没有内容，点右上角「编辑」开始写）",
    confirmCloseUnsaved: "有未保存的修改，确定关闭？",
    saveOk: "已保存",
    saveExternalConflict: "⚠️ 外部修改过此文件。点击「重新加载」会丢弃你的编辑内容。",
    saveFailed: (e) => `保存失败：${e}`,
    reload: "重新加载",
    charsCount: (n) => `${n} 字符`,
    updatedAt: (s) => `更新于 ${s}`,
  },
  bank: {
    title: "题库管理",
    subtitle: "维护你的中英双语面试题库",
    addTab: "添加题目",
    browseTab: "浏览题库",
    category: "分类",
    categoryPlaceholder: "选择已有分类...",
    newCategory: "新分类",
    singleMode: "单题录入",
    batchMode: "批量录入",
    questionZh: "问题（中文）",
    questionEn: "问题（English）",
    answerZh: "答案（中文）",
    answerEn: "答案（English）",
    aiAutoComplete: "AI 补全",
    aiAutoCompleteAll: "AI 补全全部",
    aiCompleting: "AI 补全中...",
    save: "保存到题库",
    saveSuccess: "已保存",
    saveFailed: "保存失败",
    batchPlaceholder: "格式：分类 || 问题(zh) || 问题(en) || 答案(zh) || 答案(en)",
    batchFormatHint: "每行一条，用 || 分隔：分类 | 问题(中文) | 问题(English) | 答案(中文) | 答案(English)",
    batchParseSuccess: (n) => `解析成功，共 ${n} 条`,
    batchParseFailed: "解析失败，请检查格式",
    search: "搜索",
    searchPlaceholder: "搜索题目内容...",
    allCategories: "全部分类",
    exportJson: "导出 JSON",
    exportMarkdown: "导出 Markdown",
    edit: "编辑",
    delete: "删除",
    deleteConfirm: "确定删除这道题？",
    noQuestions: "题库为空，去「添加题目」页面录入吧",
    expand: "展开",
    collapse: "收起",
    copy: "复制",
    copied: "已复制",
  },
  resume: {
    title: "简历编辑",
    subtitle: "在线编辑并导出单页简历",
    personalInfo: "个人信息",
    name: "姓名",
    phone: "电话",
    email: "邮箱",
    jobTarget: "求职意向",
    summary: "个人简介",
    links: "链接（每行一条）",
    linksHint: "GitHub / 博客 / 作品链接，每行一个",
    education: "学历",
    school: "学校",
    degree: "学位",
    major: "专业",
    startDate: "开始时间",
    endDate: "结束时间",
    gpa: "GPA",
    addEducation: "添加学历",
    removeEducation: "移除此学历",
    project: "项目经历",
    projectName: "项目名称",
    role: "你的角色",
    techStack: "技术栈",
    description: "项目描述",
    addProject: "添加项目",
    removeProject: "移除此项目",
    settings: "排版设置",
    margin: "页边距",
    lineSpacing: "行间距",
    autoFit: "自动排版",
    autoFitting: "正在计算...",
    exportPdf: "导出 PDF",
    fillTip: "填写左侧信息，右侧会实时预览简历效果",
  },
};

const en: Dict = {
  common: {
    save: "Save",
    cancel: "Cancel",
    confirm: "Confirm",
    delete: "Delete",
    edit: "Edit",
    preview: "Preview",
    close: "Close",
    download: "Download",
    export: "Export",
    refresh: "Refresh",
    loading: "Loading",
    saved: "Saved",
    unsaved: "Unsaved",
    settings: "Settings",
    restoreDefault: "Reset",
    yes: "Yes",
    no: "No",
    retry: "Retry",
    next: "Next",
  },
  nav: {
    brandSub: "Tutor",
    dashboard: "Dashboard",
    quiz: "Quiz",
    interview: "Interview",
    library: "Library",
    bank: "Question Bank",
    resume: "Resume",
  },
  dashboard: {
    welcomeTitle: "Welcome — start your AI Infra learning journey",
    statsTpl: ({ topics, total, mastered, gap }) =>
      `${topics} topics, ${total} checkpoints. Mastered ${mastered}, gaps ${gap}.`,
    actionQuizTitle: "Quiz",
    actionQuizDesc: "Pick a checkpoint — AI generates a question, grades you, and surfaces gaps",
    actionLearnTitle: "Start Learning",
    actionLearnDesc: "Enter any topic and chat with the AI tutor as you read",
    actionInterviewTitle: "Mock Interview",
    actionInterviewDesc: "Multi-turn simulation ending with a quantitative scorecard",
  },
  categories: {
    training: {
      label: "Training Infrastructure",
      description: "Distributed training, parallelism, communication, memory optimization",
    },
    inference: {
      label: "Inference Infrastructure",
      description: "Serving, KV cache, batching, quantization, acceleration",
    },
    hardware: {
      label: "Hardware & Kernels",
      description: "GPU architecture, CUDA, Triton, kernel fusion, profiling",
    },
    system: {
      label: "System Engineering",
      description: "Scheduling, monitoring, storage, serving, cost",
    },
  },
  mastery: {
    unknown: "Untouched",
    gap: "Gap",
    learning: "Learning",
    mastered: "Mastered",
    progressLabel: ({ mastered, total }) => `${mastered}/${total}`,
    learningCount: (n) => `Learning ${n}`,
    gapCount: (n) => `Gap ${n}`,
  },
  learn: {
    backToDashboard: "Back to Dashboard",
    checkpointsLabel: (n) => `CHECKPOINTS (${n})`,
    recommendedResources: "Recommended Resources",
    myNotes: "My Notes",
    relatedMyNotes: "Related Notes",
    markMastered: "Mark Mastered",
    quizMe: "Quiz Me",
    commonMisconceptions: "⚠️ Common Misconceptions",
    interviewAngles: "🎙 Common Interview Angles",
    chatHint: (cp) => `Ask the AI tutor about "${cp}"`,
    chatPlaceholder: 'Try: "Explain it as simply as possible" / "How does this differ from X?"',
  },
  chat: {
    emptyHint: 'Ask the AI tutor — e.g. "Can you give an example?", "I don\'t get this part"',
    send: "Send",
    inputPlaceholder: "Enter to send, Shift+Enter for newline",
    requestFailed: "Request failed",
    networkError: "Network error",
  },
  quiz: {
    title: "Quiz / Gap Analysis",
    subtitle:
      "Pick a checkpoint. AI poses an open question; write your answer and AI grades it, surfacing gaps and updating mastery.",
    randomFromWeak: "Random from weak spots",
    pickFromTopics: "Pick from topics...",
    pickPlaceholder: "Pick from topics...",
    nextQuestion: "Another question",
    currentCheckpoint: "Current checkpoint",
    generating: "Generating question...",
    pickToStart: "Click a button above to start",
    answerPlaceholder:
      "Write your thoughts here — the more detail you give, the more useful the feedback",
    submitAnswer: "Submit answer",
    aiGrading: "AI grading...",
    score: "Score",
    correctPoints: "✓ Points you got",
    gaps: "× Missed / underdeveloped",
    misconceptions: "⚠ Misconceptions",
    referenceAnswer: "📘 Reference answer",
    followUp: "🔍 Follow-up question",
    retryThis: "Retry this",
    reviewTopic: "Review topic",
    nextOne: "Next question",
    knowledgeMap: "Knowledge Mastery Map",
    generateFailed: "Question generation failed",
    netError: "Network error",
    evaluateFailed: "Grading failed",
  },
  interview: {
    title: "Mock Interview",
    subtitle:
      "Configure → AI plays the interviewer → at the end you get a quantitative scorecard.",
    level: "Target Level",
    focus: "Focus Areas (multi-select)",
    duration: "Planned Duration",
    durationMin: (n) => `${n} min`,
    start: "Start Interview",
    historyAnalytics: (n) => `History & Review (${n})`,
    settings: "Settings",
    exportDirLabel: "Interview history export directory",
    exportDirPlaceholder: "interview-history",
    exportDirHelp:
      "Relative to your notes library root (default ~/Documents/knowlege_library). Missing subdirectories are auto-created.",
    avgOverall: "Average Overall",
    basedOnNSessions: (n) => `Based on ${n} completed interviews`,
    topGaps: "Top Recurring Gaps (by frequency)",
    trend: "Trend",
    dimConceptClarity: "Concept Clarity",
    dimSystemDesign: "System Design",
    dimPracticalExperience: "Practical Experience",
    dimCommunication: "Communication",
    interviewer: "🎙 Interviewer",
    me: "🙋 Me",
    finishAndScore: "Finish & Score",
    generatingScorecard: "Generating scorecard...",
    interviewerThinking: "Interviewer thinking...",
    sendShortcutHint: "Type your answer (Enter sends, Shift+Enter for newline)",
    confirmRemoveHistory: "Remove this entry from history?",
    confirmRemoveHistoryFile:
      "Remove this entry from history? (The exported .md file will not be deleted.)",
    scoreReport: "Interview Scorecard",
    restart: "Start Another",
    overall: "Overall",
    strengths: "💪 Strengths",
    weaknesses: "📉 Weaknesses",
    knowledgeGaps: "📍 Knowledge Gaps (review these first)",
    knowledgeGapsShort: "Knowledge Gaps",
    nextSteps: "🚀 Next Steps",
    nextStepsShort: "Next Steps",
    gotoStudy: (name) => `Study "${name}"`,
    quizMeOnIt: "Quiz me on it",
    exportMd: "Export .md",
    exportedTo: (p) => `Exported to ${p}`,
    exportedHint: "View it in the Library tab",
    exportFailed: "Export failed",
    fromHistory: "📋 Interview History",
    transcriptCount: (n) => `Full transcript (${n} messages)`,
    transcriptCountShort: (n) => `${n} messages`,
    sessionId: "Session ID",
    exportingTo: "Export to",
    libraryRoot: "(library root)",
    confirmStartFirstMsg: "I'm ready, please ask your first question.",
    levels: {
      fresh: "New grad",
      junior: "Junior (1-3 yrs)",
      mid: "Mid (3-5 yrs)",
      senior: "Senior (5+ yrs)",
    },
    saveScorecardFailed: (e) => `Scorecard generation failed: ${e}`,
  },
  library: {
    title: "My Notes Library",
    subtitle:
      "Reads your local directory in real time; edits in the browser write back to the .md files.",
    rootHint: "Root",
    scanning: "Scanning...",
    libNotFound: "Notes library directory not found",
    setEnvHint:
      "Set KNOWLEDGE_LIBRARY_PATH in .env.local at the project root to point to your notes directory.",
    newFilePrompt: (parent) =>
      `Create a new note under "${parent || "(root)"}". Filename (auto-appends .md):`,
    newDirPrompt: (parent) => `Create a new folder under "${parent || "(root)"}":`,
    invalidFilename: 'Filename cannot contain / \\ < > : " | ? * characters',
    invalidDirname: 'Folder name cannot contain / \\ < > : " | ? * characters',
    createFailed: (e) => `Create failed: ${e}`,
    newFile: "New .md note",
    newDir: "New subfolder",
    notPreviewable: "Preview not supported for this file type",
    clickToOpen: "Click to view/edit",
  },
  docDrawer: {
    headerLabel: (dir) => `📚 My Notes · ${dir || ""}`,
    rootLabel: "(root)",
    loading: "Loading...",
    readFailed: (e) => `⚠️ Failed to read: ${e}`,
    emptyContent: '(This note is empty — click "Edit" on the top right to start writing)',
    confirmCloseUnsaved: "You have unsaved changes. Close anyway?",
    saveOk: "Saved",
    saveExternalConflict:
      '⚠️ This file was modified externally. Clicking "Reload" will discard your edits.',
    saveFailed: (e) => `Save failed: ${e}`,
    reload: "Reload",
    charsCount: (n) => `${n} chars`,
    updatedAt: (s) => `Updated ${s}`,
  },
  bank: {
    title: "Question Bank",
    subtitle: "Manage your bilingual interview questions",
    addTab: "Add Questions",
    browseTab: "Browse Questions",
    category: "Category",
    categoryPlaceholder: "Select existing category...",
    newCategory: "New Category",
    singleMode: "Single Entry",
    batchMode: "Batch Entry",
    questionZh: "Question (中文)",
    questionEn: "Question (English)",
    answerZh: "Answer (中文)",
    answerEn: "Answer (English)",
    aiAutoComplete: "AI Complete",
    aiAutoCompleteAll: "AI Complete All",
    aiCompleting: "AI completing...",
    save: "Save to Bank",
    saveSuccess: "Saved",
    saveFailed: "Save failed",
    batchPlaceholder: "Format: category || question(zh) || question(en) || answer(zh) || answer(en)",
    batchFormatHint: "One per line, separated by || : category | question(zh) | question(en) | answer(zh) | answer(en)",
    batchParseSuccess: (n) => `Parsed successfully: ${n} items`,
    batchParseFailed: "Parse failed, check format",
    search: "Search",
    searchPlaceholder: "Search questions...",
    allCategories: "All Categories",
    exportJson: "Export JSON",
    exportMarkdown: "Export Markdown",
    edit: "Edit",
    delete: "Delete",
    deleteConfirm: "Delete this question?",
    noQuestions: "No questions yet. Go to 'Add Questions' tab to start.",
    expand: "Expand",
    collapse: "Collapse",
    copy: "Copy",
    copied: "Copied",
  },
  resume: {
    title: "Resume Editor",
    subtitle: "Edit and export a one-page resume",
    personalInfo: "Personal Info",
    name: "Name",
    phone: "Phone",
    email: "Email",
    jobTarget: "Job Target",
    summary: "Summary",
    links: "Links (one per line)",
    linksHint: "GitHub / Blog / portfolio links, one per line",
    education: "Education",
    school: "School",
    degree: "Degree",
    major: "Major",
    startDate: "Start",
    endDate: "End",
    gpa: "GPA",
    addEducation: "Add Education",
    removeEducation: "Remove",
    project: "Projects",
    projectName: "Project Name",
    role: "Your Role",
    techStack: "Tech Stack",
    description: "Description",
    addProject: "Add Project",
    removeProject: "Remove",
    settings: "Layout",
    margin: "Margin",
    lineSpacing: "Line Spacing",
    autoFit: "Auto Fit",
    autoFitting: "Optimizing...",
    exportPdf: "Export PDF",
    fillTip: "Fill in the editor on the left; preview updates in real time on the right.",
  },
};

export const DICT: Record<Lang, Dict> = { zh, en };
