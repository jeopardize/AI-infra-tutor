import type { Topic } from "./types";

export const inferenceTopics: Topic[] = [
  {
    id: "kv-cache",
    title: "KV Cache",
    category: "inference",
    summary: "推理优化的基石：缓存历史 token 的 K/V 避免重复计算",
    prerequisites: [],
    localDocs: [
      "paper/KV cache 论文.md",
      "大模型基础知识/Attention相关知识/attention相关知识.md",
      "paper/Efficient_llm_inference/efficient_llm_inference.md",
    ],
    checkpoints: [
      {
        id: "kv-basic",
        name: "KV cache 为什么必要",
        mustKnow: `自回归生成时，每生成一个新 token，attention 需要它对**之前所有 token** 的 Q·K^T。

如果不缓存，每步都要重算前面所有 token 的 K/V → 复杂度 \`O(L^2)\` 每步、\`O(L^3)\` 总；
缓存后每步只需算新 token 的 K/V 并和缓存拼接 → \`O(L)\` 每步、\`O(L^2)\` 总。

代价是显存：cache 大小 = \`2 (K+V) × num_layers × num_heads × head_dim × seq_len × batch × bytes\`。LLaMA-7B 在 2048 长度下单 batch 约 **1GB**。`,
        commonMisconceptions: [
          "以为 Q 也需要缓存——Q 只是当前 token 的，不复用",
          "把 KV cache 和 prefix cache 混淆——后者是跨 request 复用",
        ],
        interviewAngles: [
          "KV cache 大小怎么算？",
          "为什么 GQA/MQA 能减小 KV cache？",
          "长序列下 KV cache 会成为瓶颈吗？",
        ],
      },
      {
        id: "mqa-gqa",
        name: "MHA / MQA / GQA",
        mustKnow: `- **MHA**：每个 head 独立的 K/V → cache 最大
- **MQA**：所有 head 共享一组 K/V → cache 缩小 \`num_heads\` 倍，但质量下降
- **GQA**：把 head 分成 G 组，组内共享 K/V → 折中（LLaMA-2 70B、LLaMA-3 全系列都用 GQA）

只影响 K/V 投影的输出维度，Q 仍是 full multi-head。`,
        commonMisconceptions: [
          "以为 MQA 减小总参数量——其实只减小 K/V 投影，Q 不变",
        ],
        interviewAngles: [
          "GQA 为什么是当前主流？",
          "把 MHA 模型转成 GQA 怎么做？",
        ],
      },
    ],
    resources: [
      { title: "GQA 论文", url: "https://arxiv.org/abs/2305.13245", kind: "paper" },
    ],
  },
  {
    id: "continuous-batching",
    title: "Continuous Batching（连续批处理）",
    category: "inference",
    summary: "动态拼 batch、step 级调度，是 vLLM 吞吐高的核心原因之一",
    prerequisites: ["kv-cache"],
    localDocs: [
      "paper/Efficient_llm_inference/efficient_llm_inference.md",
      "大模型相关知识/VLLM源码阅读/其他概念.md",
    ],
    checkpoints: [
      {
        id: "static-vs-continuous",
        name: "Static batching 的问题与 continuous batching 的解法",
        mustKnow: `**Static batching**：组好一个 batch 后必须等所有 request **同时完成**才能下一批。短 request 完成后槽位空闲，GPU 利用率低。

**Continuous batching**（也叫 in-flight batching）：以**单个生成 step** 为调度单位，每步结束后：
- 已完成的 request 立即返回
- 新到达的 request 在下一步立即加入 batch

需要支持**不同 prefix 长度共存于一个 batch**——所以要么 padding（浪费），要么用 PagedAttention 这种灵活的 KV 管理。`,
        commonMisconceptions: [
          "把 continuous batching 和 dynamic batching 等同——后者只是动态组 batch，仍是 request 级",
        ],
        interviewAngles: [
          "Continuous batching 为什么需要 PagedAttention 配合？",
          "调度粒度是 step 还是 token？",
        ],
      },
    ],
    resources: [
      {
        title: "Orca 论文（continuous batching 起源）",
        url: "https://www.usenix.org/conference/osdi22/presentation/yu",
        kind: "paper",
      },
    ],
  },
  {
    id: "paged-attention",
    title: "PagedAttention (vLLM)",
    category: "inference",
    summary: "把 KV cache 当虚拟内存来管：分页、共享、零拷贝 fork",
    prerequisites: ["kv-cache", "continuous-batching"],
    localDocs: ["大模型相关知识/VLLM源码阅读/其他概念.md"],
    checkpoints: [
      {
        id: "paged-attn-core",
        name: "PagedAttention 核心思想",
        mustKnow: `传统 KV cache 给每个 request 预分配连续大块显存（按 max_seq_len），**内部碎片严重**（实际可能只用 100 个 token）。

PagedAttention 把每个 request 的 KV 切成**固定大小的 block**（如 16 tokens / block），用一张 block table 维护逻辑→物理映射。类比操作系统的虚拟内存分页。

收益：
- 显存利用率从 ~30% 提高到 ~95%
- 同一 prefix 的多个 request 可以**共享 block**（beam search、parallel sampling、prefix caching 都基于此）`,
        commonMisconceptions: [
          "以为 PagedAttention 只是省显存——它还是 prefix caching 等高级特性的前提",
          "以为 block 越大越好——大 block 又退化成连续分配",
        ],
        interviewAngles: [
          "PagedAttention 怎么类比 OS 虚拟内存？",
          "block size 怎么选？",
          "Copy-on-Write 在 PagedAttention 里如何体现？",
        ],
      },
    ],
    resources: [
      {
        title: "vLLM / PagedAttention 论文 (SOSP'23)",
        url: "https://arxiv.org/abs/2309.06180",
        kind: "paper",
      },
    ],
  },
  {
    id: "quantization",
    title: "推理量化 (Quantization)",
    category: "inference",
    summary: "FP16 → INT8/INT4/FP8，减显存、加吞吐，质量损失可控",
    prerequisites: [],
    localDocs: ["paper/Quantization/Quantization.md"],
    checkpoints: [
      {
        id: "ptq-vs-qat",
        name: "PTQ vs QAT；weight-only vs activation 量化",
        mustKnow: `- **PTQ (Post-Training)**：训练完直接量化，无需重训。主流方案：**GPTQ**（基于 Hessian 校正）、**AWQ**（按激活幅值保留重要 weight 通道）
- **QAT (Quantization-Aware)**：训练时插入伪量化节点，质量最好但成本高
- **weight-only**（如 GPTQ INT4）：只量化 weight，计算时 dequant 回 FP16 算；**省显存为主**，对 decode 阶段（memory-bound）特别有效
- **W8A8 / W4A8**：同时量化 weight 和 activation，能用 INT8 Tensor Core，**吞吐提升明显**`,
        commonMisconceptions: [
          "以为 INT4 weight-only 也能提升 compute throughput——其实只省显存带宽",
          "把 calibration 数据和训练数据搞混——calibration 只要少量代表性样本",
        ],
        interviewAngles: [
          "为什么 weight-only INT4 主要受益于 decode？",
          "GPTQ 和 AWQ 的区别？",
          "FP8 相比 INT8 有什么优势？",
        ],
      },
      {
        id: "smoothquant",
        name: "Activation 量化的难点 & SmoothQuant",
        mustKnow: `Activation 比 weight 更难量化：**outlier 通道**（个别 channel 数值远大于其他）会撑大量化 scale，吞掉其他通道精度。

**SmoothQuant** 的思路：把 activation 的 outlier "迁移"到 weight 上——\`Y = (X · diag(s)) · (diag(1/s) · W)\`，数学等价但 activation 变平滑、weight 略微不平滑（weight 容忍度更高）。`,
        commonMisconceptions: [
          "把 activation 量化看得和 weight 一样简单",
        ],
        interviewAngles: [
          "为什么 activation 量化比 weight 更难？",
          "SmoothQuant 如何处理 outlier？",
        ],
      },
    ],
    resources: [
      { title: "GPTQ", url: "https://arxiv.org/abs/2210.17323", kind: "paper" },
      { title: "AWQ", url: "https://arxiv.org/abs/2306.00978", kind: "paper" },
      { title: "SmoothQuant", url: "https://arxiv.org/abs/2211.10438", kind: "paper" },
    ],
  },
  {
    id: "speculative-decoding",
    title: "Speculative Decoding（投机解码）",
    category: "inference",
    summary: "小模型先猜 N 个 token，大模型一次性 verify；降低 decode 延迟",
    prerequisites: ["kv-cache"],
    checkpoints: [
      {
        id: "spec-basic",
        name: "投机解码原理与正确性",
        mustKnow: `Decode 是 memory-bound：每步只生成 1 个 token，但要把整个模型权重从 HBM 读一遍，算力浪费。

**投机解码**：
1. **Draft 模型**（小、便宜）自回归生成 K 个候选 token
2. **Target 模型**（大）一次 forward 同时计算这 K 个位置的概率分布
3. 用**接受/拒绝采样**确保最终分布严格等于 target 模型单独 decode 的分布（数学上无损）

收益：若平均接受 \`α·K\` 个 token，每次 target forward 等价于走了 \`α·K\` 步，延迟降低 \`α·K\` 倍。`,
        commonMisconceptions: [
          "以为投机解码会改变输出分布——正确实现是严格无损的",
          "以为 draft 越准越好——draft 太大就失去速度优势",
        ],
        interviewAngles: [
          "为什么 decode 是 memory-bound？",
          "接受/拒绝采样如何保证分布等价？",
          "Medusa / EAGLE / Lookahead 各自的思路？",
        ],
      },
    ],
    resources: [
      {
        title: "Fast Inference from Transformers via Speculative Decoding",
        url: "https://arxiv.org/abs/2211.17192",
        kind: "paper",
      },
    ],
  },
  {
    id: "prefix-caching",
    title: "Prefix Caching",
    category: "inference",
    summary: "跨 request 复用相同前缀的 KV cache，对 system prompt / few-shot 极有效",
    prerequisites: ["paged-attention"],
    checkpoints: [
      {
        id: "prefix-cache",
        name: "Prefix caching 原理与命中率",
        mustKnow: `多个 request 经常共享前缀（同一个 system prompt、相同的 few-shot 示例、agent 的对话历史等）。

实现：
- 用 prefix 的 hash 作为 key，把对应的 KV blocks 放进 LRU 池
- 新 request 来了先做最长前缀匹配，命中部分跳过 prefill
- 配合 PagedAttention 的 block 共享天然契合

收益场景：
- Chat 应用的多轮对话（每轮共享之前的全部历史）
- Agent 工具调用（每次都带相同的 system prompt + tools）
- 评测/批量任务（相同 prompt 模板）`,
        commonMisconceptions: [
          "以为 prefix caching 总能加速——random prompt 命中率为 0 时没收益",
          "忘了 prefix 必须按 token 对齐，差一个 token 就 cache miss",
        ],
        interviewAngles: [
          "Prefix caching 和 KV cache 有什么区别？",
          "LRU 淘汰策略对命中率影响？",
          "为什么 prefix caching 对 agent 场景特别重要？",
        ],
      },
    ],
    resources: [],
  },
];
