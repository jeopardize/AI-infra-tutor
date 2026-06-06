import type { Topic } from "./types";

export const inferenceTopics: Topic[] = [
  {
    id: "kv-cache",
    title: "KV Cache",
    titleEn: "KV Cache",
    category: "inference",
    summary: "推理优化的基石：缓存历史 token 的 K/V 避免重复计算",
    summaryEn:
      "The foundation of inference optimization: cache historical tokens' K/V to avoid recomputation",
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
        nameEn: "Why KV cache is necessary",
        mustKnow: `自回归生成时，每生成一个新 token，attention 需要它对**之前所有 token** 的 Q·K^T。

如果不缓存，每步都要重算前面所有 token 的 K/V → 复杂度 \`O(L^2)\` 每步、\`O(L^3)\` 总；
缓存后每步只需算新 token 的 K/V 并和缓存拼接 → \`O(L)\` 每步、\`O(L^2)\` 总。

代价是显存：cache 大小 = \`2 (K+V) × num_layers × num_heads × head_dim × seq_len × batch × bytes\`。LLaMA-7B 在 2048 长度下单 batch 约 **1GB**。`,
        mustKnowEn: `In autoregressive generation, every new token's attention needs to compute Q·Kᵀ against **all previous tokens**.

Without caching, every step re-derives K/V for every prior token → \`O(L²)\` per step, \`O(L³)\` total.
With caching, every step only computes the new token's K/V and concatenates with the cache → \`O(L)\` per step, \`O(L²)\` total.

The trade-off is memory: cache size = \`2 (K+V) × num_layers × num_heads × head_dim × seq_len × batch × bytes\`. For LLaMA-7B at length 2048 with batch 1, that's about **1 GB**.`,
        commonMisconceptions: [
          "以为 Q 也需要缓存——Q 只是当前 token 的，不复用",
          "把 KV cache 和 prefix cache 混淆——后者是跨 request 复用",
        ],
        commonMisconceptionsEn: [
          "Thinking Q also needs caching — Q is only for the current token and isn't reused",
          "Confusing KV cache with prefix cache — the latter is reuse across requests",
        ],
        interviewAngles: [
          "KV cache 大小怎么算？",
          "为什么 GQA/MQA 能减小 KV cache？",
          "长序列下 KV cache 会成为瓶颈吗？",
        ],
        interviewAnglesEn: [
          "How do you calculate KV cache size?",
          "Why do GQA/MQA shrink the KV cache?",
          "Does KV cache become a bottleneck at long sequences?",
        ],
      },
      {
        id: "mqa-gqa",
        name: "MHA / MQA / GQA",
        nameEn: "MHA / MQA / GQA",
        mustKnow: `- **MHA**：每个 head 独立的 K/V → cache 最大
- **MQA**：所有 head 共享一组 K/V → cache 缩小 \`num_heads\` 倍，但质量下降
- **GQA**：把 head 分成 G 组，组内共享 K/V → 折中（LLaMA-2 70B、LLaMA-3 全系列都用 GQA）

只影响 K/V 投影的输出维度，Q 仍是 full multi-head。`,
        mustKnowEn: `- **MHA**: each head has its own K/V → biggest cache
- **MQA**: all heads share one K/V → cache shrinks by a factor of \`num_heads\`, but quality drops
- **GQA**: heads grouped into G clusters, each group sharing K/V → the sweet spot (LLaMA-2 70B and the entire LLaMA-3 family use GQA)

Only K/V projection output dimensions are affected; Q remains full multi-head.`,
        commonMisconceptions: [
          "以为 MQA 减小总参数量——其实只减小 K/V 投影，Q 不变",
        ],
        commonMisconceptionsEn: [
          "Thinking MQA reduces total parameters — it only shrinks K/V projections; Q is unchanged",
        ],
        interviewAngles: [
          "GQA 为什么是当前主流？",
          "把 MHA 模型转成 GQA 怎么做？",
        ],
        interviewAnglesEn: [
          "Why is GQA the current mainstream?",
          "How do you convert an MHA model into GQA?",
        ],
      },
    ],
    resources: [
      {
        title: "GQA 论文",
        titleEn: "GQA paper",
        url: "https://arxiv.org/abs/2305.13245",
        kind: "paper",
      },
    ],
  },
  {
    id: "continuous-batching",
    title: "Continuous Batching（连续批处理）",
    titleEn: "Continuous Batching",
    category: "inference",
    summary: "动态拼 batch、step 级调度，是 vLLM 吞吐高的核心原因之一",
    summaryEn:
      "Dynamic batch composition with step-level scheduling — one of the key reasons vLLM has such high throughput",
    prerequisites: ["kv-cache"],
    localDocs: [
      "paper/Efficient_llm_inference/efficient_llm_inference.md",
      "大模型相关知识/VLLM源码阅读/其他概念.md",
    ],
    checkpoints: [
      {
        id: "static-vs-continuous",
        name: "Static batching 的问题与 continuous batching 的解法",
        nameEn: "Problems with static batching, and how continuous batching solves them",
        mustKnow: `**Static batching**：组好一个 batch 后必须等所有 request **同时完成**才能下一批。短 request 完成后槽位空闲，GPU 利用率低。

**Continuous batching**（也叫 in-flight batching）：以**单个生成 step** 为调度单位，每步结束后：
- 已完成的 request 立即返回
- 新到达的 request 在下一步立即加入 batch

需要支持**不同 prefix 长度共存于一个 batch**——所以要么 padding（浪费），要么用 PagedAttention 这种灵活的 KV 管理。`,
        mustKnowEn: `**Static batching**: once a batch is formed, you must wait for **all requests to finish together** before starting the next. Short requests leave their slots idle, hurting GPU utilization.

**Continuous batching** (a.k.a. in-flight batching): schedules at the **per-generation-step** granularity. After each step:
- Finished requests return immediately
- Newly arrived requests join the batch at the very next step

This requires supporting **different prefix lengths in one batch** — so you either pad (wasteful) or use flexible KV management like PagedAttention.`,
        commonMisconceptions: [
          "把 continuous batching 和 dynamic batching 等同——后者只是动态组 batch，仍是 request 级",
        ],
        commonMisconceptionsEn: [
          "Conflating continuous batching with dynamic batching — the latter just dynamically forms batches but is still request-level",
        ],
        interviewAngles: [
          "Continuous batching 为什么需要 PagedAttention 配合？",
          "调度粒度是 step 还是 token？",
        ],
        interviewAnglesEn: [
          "Why does continuous batching need PagedAttention to work well?",
          "Is the scheduling granularity step or token?",
        ],
      },
    ],
    resources: [
      {
        title: "Orca 论文（continuous batching 起源）",
        titleEn: "Orca paper (origin of continuous batching)",
        url: "https://www.usenix.org/conference/osdi22/presentation/yu",
        kind: "paper",
      },
    ],
  },
  {
    id: "paged-attention",
    title: "PagedAttention (vLLM)",
    titleEn: "PagedAttention (vLLM)",
    category: "inference",
    summary: "把 KV cache 当虚拟内存来管：分页、共享、零拷贝 fork",
    summaryEn:
      "Manage KV cache like OS virtual memory: paging, sharing, copy-on-write fork",
    prerequisites: ["kv-cache", "continuous-batching"],
    localDocs: ["大模型相关知识/VLLM源码阅读/其他概念.md"],
    checkpoints: [
      {
        id: "paged-attn-core",
        name: "PagedAttention 核心思想",
        nameEn: "PagedAttention core idea",
        mustKnow: `传统 KV cache 给每个 request 预分配连续大块显存（按 max_seq_len），**内部碎片严重**（实际可能只用 100 个 token）。

PagedAttention 把每个 request 的 KV 切成**固定大小的 block**（如 16 tokens / block），用一张 block table 维护逻辑→物理映射。类比操作系统的虚拟内存分页。

收益：
- 显存利用率从 ~30% 提高到 ~95%
- 同一 prefix 的多个 request 可以**共享 block**（beam search、parallel sampling、prefix caching 都基于此）`,
        mustKnowEn: `Traditional KV cache pre-allocates a large contiguous block of memory per request (sized by max_seq_len), causing **heavy internal fragmentation** (a request might use only 100 tokens).

PagedAttention slices each request's KV into **fixed-size blocks** (e.g. 16 tokens/block) and uses a block table to map logical → physical. Analogous to OS virtual memory paging.

Benefits:
- Memory utilization jumps from ~30% to ~95%
- Multiple requests sharing the same prefix can **share blocks** (the foundation for beam search, parallel sampling, prefix caching)`,
        commonMisconceptions: [
          "以为 PagedAttention 只是省显存——它还是 prefix caching 等高级特性的前提",
          "以为 block 越大越好——大 block 又退化成连续分配",
        ],
        commonMisconceptionsEn: [
          "Thinking PagedAttention is just memory savings — it's also the foundation for advanced features like prefix caching",
          "Thinking bigger blocks are always better — large blocks degenerate back to contiguous allocation",
        ],
        interviewAngles: [
          "PagedAttention 怎么类比 OS 虚拟内存？",
          "block size 怎么选？",
          "Copy-on-Write 在 PagedAttention 里如何体现？",
        ],
        interviewAnglesEn: [
          "How is PagedAttention analogous to OS virtual memory?",
          "How do you choose block size?",
          "How does copy-on-write manifest in PagedAttention?",
        ],
      },
    ],
    resources: [
      {
        title: "vLLM / PagedAttention 论文 (SOSP'23)",
        titleEn: "vLLM / PagedAttention paper (SOSP'23)",
        url: "https://arxiv.org/abs/2309.06180",
        kind: "paper",
      },
    ],
  },
  {
    id: "quantization",
    title: "推理量化 (Quantization)",
    titleEn: "Quantization",
    category: "inference",
    summary: "FP16 → INT8/INT4/FP8，减显存、加吞吐，质量损失可控",
    summaryEn:
      "FP16 → INT8/INT4/FP8 to cut memory and boost throughput with controllable quality loss",
    prerequisites: [],
    localDocs: ["paper/Quantization/Quantization.md"],
    checkpoints: [
      {
        id: "ptq-vs-qat",
        name: "PTQ vs QAT；weight-only vs activation 量化",
        nameEn: "PTQ vs QAT; weight-only vs activation quantization",
        mustKnow: `- **PTQ (Post-Training)**：训练完直接量化，无需重训。主流方案：**GPTQ**（基于 Hessian 校正）、**AWQ**（按激活幅值保留重要 weight 通道）
- **QAT (Quantization-Aware)**：训练时插入伪量化节点，质量最好但成本高
- **weight-only**（如 GPTQ INT4）：只量化 weight，计算时 dequant 回 FP16 算；**省显存为主**，对 decode 阶段（memory-bound）特别有效
- **W8A8 / W4A8**：同时量化 weight 和 activation，能用 INT8 Tensor Core，**吞吐提升明显**`,
        mustKnowEn: `- **PTQ (Post-Training)**: quantize after training, no retraining needed. Popular methods: **GPTQ** (Hessian-based correction), **AWQ** (preserves important weight channels based on activation magnitude)
- **QAT (Quantization-Aware)**: inject fake-quant nodes during training — best quality but expensive
- **Weight-only** (e.g. GPTQ INT4): only weights are quantized; compute still dequants back to FP16. **Primarily saves memory**; especially effective for decode (which is memory-bound)
- **W8A8 / W4A8**: quantize both weights and activations, enabling INT8 Tensor Cores → **significant throughput gains**`,
        commonMisconceptions: [
          "以为 INT4 weight-only 也能提升 compute throughput——其实只省显存带宽",
          "把 calibration 数据和训练数据搞混——calibration 只要少量代表性样本",
        ],
        commonMisconceptionsEn: [
          "Thinking INT4 weight-only also boosts compute throughput — it only saves memory bandwidth",
          "Confusing calibration data with training data — calibration only needs a small representative set",
        ],
        interviewAngles: [
          "为什么 weight-only INT4 主要受益于 decode？",
          "GPTQ 和 AWQ 的区别？",
          "FP8 相比 INT8 有什么优势？",
        ],
        interviewAnglesEn: [
          "Why does weight-only INT4 primarily benefit the decode phase?",
          "What's the difference between GPTQ and AWQ?",
          "What advantages does FP8 have over INT8?",
        ],
      },
      {
        id: "smoothquant",
        name: "Activation 量化的难点 & SmoothQuant",
        nameEn: "Challenges of activation quantization & SmoothQuant",
        mustKnow: `Activation 比 weight 更难量化：**outlier 通道**（个别 channel 数值远大于其他）会撑大量化 scale，吞掉其他通道精度。

**SmoothQuant** 的思路：把 activation 的 outlier "迁移"到 weight 上——\`Y = (X · diag(s)) · (diag(1/s) · W)\`，数学等价但 activation 变平滑、weight 略微不平滑（weight 容忍度更高）。`,
        mustKnowEn: `Activations are harder to quantize than weights: **outlier channels** (a few channels with much larger magnitude than the rest) stretch the quantization scale and crush precision in the other channels.

**SmoothQuant** "migrates" activation outliers onto weights: \`Y = (X · diag(s)) · (diag(1/s) · W)\` — mathematically equivalent, but activations become smoother while weights become slightly less smooth (weights tolerate it better).`,
        commonMisconceptions: [
          "把 activation 量化看得和 weight 一样简单",
        ],
        commonMisconceptionsEn: [
          "Treating activation quantization as if it were as simple as weight quantization",
        ],
        interviewAngles: [
          "为什么 activation 量化比 weight 更难？",
          "SmoothQuant 如何处理 outlier？",
        ],
        interviewAnglesEn: [
          "Why is activation quantization harder than weight quantization?",
          "How does SmoothQuant handle outliers?",
        ],
      },
    ],
    resources: [
      { title: "GPTQ", titleEn: "GPTQ", url: "https://arxiv.org/abs/2210.17323", kind: "paper" },
      { title: "AWQ", titleEn: "AWQ", url: "https://arxiv.org/abs/2306.00978", kind: "paper" },
      {
        title: "SmoothQuant",
        titleEn: "SmoothQuant",
        url: "https://arxiv.org/abs/2211.10438",
        kind: "paper",
      },
    ],
  },
  {
    id: "speculative-decoding",
    title: "Speculative Decoding（投机解码）",
    titleEn: "Speculative Decoding",
    category: "inference",
    summary: "小模型先猜 N 个 token，大模型一次性 verify；降低 decode 延迟",
    summaryEn:
      "A small model guesses N tokens, the big model verifies them in one shot — cutting decode latency",
    prerequisites: ["kv-cache"],
    checkpoints: [
      {
        id: "spec-basic",
        name: "投机解码原理与正确性",
        nameEn: "Speculative decoding mechanics & correctness",
        mustKnow: `Decode 是 memory-bound：每步只生成 1 个 token，但要把整个模型权重从 HBM 读一遍，算力浪费。

**投机解码**：
1. **Draft 模型**（小、便宜）自回归生成 K 个候选 token
2. **Target 模型**（大）一次 forward 同时计算这 K 个位置的概率分布
3. 用**接受/拒绝采样**确保最终分布严格等于 target 模型单独 decode 的分布（数学上无损）

收益：若平均接受 \`α·K\` 个 token，每次 target forward 等价于走了 \`α·K\` 步，延迟降低 \`α·K\` 倍。`,
        mustKnowEn: `Decode is memory-bound: each step only emits one token, yet you read the entire model weights from HBM — wasted compute.

**Speculative decoding**:
1. A small, cheap **draft model** autoregressively proposes K candidate tokens
2. The big **target model** runs **one forward pass** that scores all K positions simultaneously
3. **Accept/reject sampling** guarantees the final distribution exactly matches what the target model would produce alone (mathematically lossless)

Payoff: if on average \`α·K\` tokens are accepted, each target-model forward pass advances by \`α·K\` steps — \`α·K\`× latency reduction.`,
        commonMisconceptions: [
          "以为投机解码会改变输出分布——正确实现是严格无损的",
          "以为 draft 越准越好——draft 太大就失去速度优势",
        ],
        commonMisconceptionsEn: [
          "Thinking speculative decoding changes the output distribution — a correct implementation is strictly lossless",
          "Thinking a more accurate draft is always better — if the draft is too large, you lose the speed advantage",
        ],
        interviewAngles: [
          "为什么 decode 是 memory-bound？",
          "接受/拒绝采样如何保证分布等价？",
          "Medusa / EAGLE / Lookahead 各自的思路？",
        ],
        interviewAnglesEn: [
          "Why is decode memory-bound?",
          "How does accept/reject sampling preserve the target distribution?",
          "What are the core ideas of Medusa / EAGLE / Lookahead?",
        ],
      },
    ],
    resources: [
      {
        title: "Fast Inference from Transformers via Speculative Decoding",
        titleEn: "Fast Inference from Transformers via Speculative Decoding",
        url: "https://arxiv.org/abs/2211.17192",
        kind: "paper",
      },
    ],
  },
  {
    id: "prefix-caching",
    title: "Prefix Caching",
    titleEn: "Prefix Caching",
    category: "inference",
    summary: "跨 request 复用相同前缀的 KV cache，对 system prompt / few-shot 极有效",
    summaryEn:
      "Reuse KV cache of identical prefixes across requests — especially effective for system prompts and few-shot",
    prerequisites: ["paged-attention"],
    checkpoints: [
      {
        id: "prefix-cache",
        name: "Prefix caching 原理与命中率",
        nameEn: "Prefix caching mechanics & hit rate",
        mustKnow: `多个 request 经常共享前缀（同一个 system prompt、相同的 few-shot 示例、agent 的对话历史等）。

实现：
- 用 prefix 的 hash 作为 key，把对应的 KV blocks 放进 LRU 池
- 新 request 来了先做最长前缀匹配，命中部分跳过 prefill
- 配合 PagedAttention 的 block 共享天然契合

收益场景：
- Chat 应用的多轮对话（每轮共享之前的全部历史）
- Agent 工具调用（每次都带相同的 system prompt + tools）
- 评测/批量任务（相同 prompt 模板）`,
        mustKnowEn: `Many requests share a prefix (a shared system prompt, the same few-shot examples, an agent's running conversation history, etc.).

Implementation:
- Use the prefix hash as a key; place the corresponding KV blocks into an LRU pool
- For a new request, do longest-prefix matching; skip prefill on the matched portion
- Composes naturally with PagedAttention's block sharing

Where it pays off:
- Multi-turn chat (every turn shares the entire prior history)
- Agent tool-use (same system prompt + tools every time)
- Eval / batch jobs (identical prompt templates)`,
        commonMisconceptions: [
          "以为 prefix caching 总能加速——random prompt 命中率为 0 时没收益",
          "忘了 prefix 必须按 token 对齐，差一个 token 就 cache miss",
        ],
        commonMisconceptionsEn: [
          "Thinking prefix caching always speeds things up — with random prompts the hit rate is zero and there's no benefit",
          "Forgetting that prefixes must align by token — one different token and you miss the cache",
        ],
        interviewAngles: [
          "Prefix caching 和 KV cache 有什么区别？",
          "LRU 淘汰策略对命中率影响？",
          "为什么 prefix caching 对 agent 场景特别重要？",
        ],
        interviewAnglesEn: [
          "How does prefix caching differ from plain KV cache?",
          "How does the LRU eviction policy affect hit rate?",
          "Why is prefix caching particularly important for agent workloads?",
        ],
      },
    ],
    resources: [],
  },
];
