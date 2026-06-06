import type { Topic } from "./types";

export const trainingTopics: Topic[] = [
  {
    id: "data-parallel",
    title: "数据并行 (Data Parallelism)",
    category: "training",
    summary: "把 batch 切到多卡，每卡完整模型副本；最基础也最重要的并行策略",
    prerequisites: [],
    localDocs: ["大模型基础知识/推理并行/5p推理.md"],
    checkpoints: [
      {
        id: "dp-basic",
        name: "DP / DDP 基本原理",
        mustKnow: `**核心**：把一个 batch 拆成 N 份分到 N 张 GPU，每张卡持有**完整的模型副本**，独立 forward + backward，最后通过 **all-reduce** 同步梯度。

- **PyTorch DP**（已不推荐）：单进程多线程，主卡做 scatter/gather，存在 GIL 和负载不均
- **PyTorch DDP**（主流）：多进程，每进程一个 GPU，使用 NCCL 后端做 all-reduce
- 每张卡看到的有效 batch size = per-GPU batch × world_size`,
        commonMisconceptions: [
          "以为 DP 和 DDP 性能差不多——实际 DDP 在多卡场景快很多",
          "忘了 BatchNorm 在 DP 下统计量是局部的，需要 SyncBN 才能跨卡同步",
        ],
        interviewAngles: [
          "为什么 DDP 比 DP 快？",
          "DDP 的梯度同步发生在 backward 的哪一步？",
          "为什么 DDP 要用 bucket 来做 all-reduce？",
        ],
      },
      {
        id: "dp-overlap",
        name: "通信与计算重叠 (gradient bucketing)",
        mustKnow: `DDP 会把参数梯度分桶（bucket，默认 25MB），在 backward 过程中**一边算后续层的梯度，一边对已算完桶里的梯度发起 all-reduce**，从而让通信和计算重叠。

- 反向传播是从后往前的，所以最后一层的梯度先就绪，可以立即发 all-reduce
- bucket 越大，通信效率越高但重叠机会越少；越小则反之
- \`find_unused_parameters=True\` 会显著拖慢训练（要扫一遍图），尽量避免`,
        commonMisconceptions: [
          "以为梯度是 backward 全部结束后才同步——其实 DDP 是流式的",
          "把 bucket size 调到极小希望快——反而通信开销上升",
        ],
        interviewAngles: [
          "DDP 如何让 NCCL 通信和 compute 重叠？",
          "bucket size 怎么调？",
          "为什么 find_unused_parameters 慢？",
        ],
      },
    ],
    resources: [
      {
        title: "PyTorch DDP 官方教程",
        url: "https://pytorch.org/tutorials/intermediate/ddp_tutorial.html",
        kind: "docs",
      },
    ],
  },
  {
    id: "tensor-parallel",
    title: "张量并行 (Tensor Parallelism)",
    category: "training",
    summary: "把单个矩阵乘按行/列切到多卡，适合参数大到单卡放不下的层",
    prerequisites: ["data-parallel"],
    localDocs: ["大模型基础知识/推理并行/5p推理.md"],
    checkpoints: [
      {
        id: "tp-megatron",
        name: "Megatron 风格 TP（列并行 + 行并行）",
        mustKnow: `把 Transformer 中的两个连续 GEMM 拆开：
- 第一个 GEMM **按列切**（column parallel）：每卡持有部分输出列，**无需通信**就能算出局部输出
- 第二个 GEMM **按行切**（row parallel）：每卡持有部分输入列，乘完后做一次 **all-reduce** 把部分和加起来

QKV 投影适合列并行（每个 head 落在一张卡上），output 投影适合行并行。一个 Transformer block 的 forward 只需 2 次 all-reduce（attention 和 MLP 各一次），backward 对称再 2 次。`,
        commonMisconceptions: [
          "以为 TP 只是简单地按 head 切——其实是按 GEMM 的输入/输出维度切",
          "忘了 TP 引入了同步通信，跨节点 TP 性能会急剧下降",
        ],
        interviewAngles: [
          "为什么 TP 一般不跨节点？",
          "列并行和行并行分别在什么时机做通信？",
          "TP=8 时每张 GPU 持有多少 QKV 参数？",
        ],
      },
      {
        id: "tp-sp",
        name: "序列并行 (Sequence Parallelism)",
        mustKnow: `TP 的扩展：在 TP 没切到的维度（LayerNorm / Dropout）上**按序列长度切**，进一步降低激活值的显存。

- 在 LayerNorm 之前做 all-gather（把序列拼回来供 TP 的 GEMM 用），LayerNorm 之后做 reduce-scatter
- 总通信量和原 TP 相同，但激活内存显著降低
- 是长序列训练的关键`,
        commonMisconceptions: [
          "以为 SP 增加通信——其实是把 all-reduce 拆成 all-gather + reduce-scatter，总量不变",
        ],
        interviewAngles: [
          "SP 为什么不增加总通信量？",
          "什么情况下必须用 SP？",
        ],
      },
    ],
    resources: [
      {
        title: "Megatron-LM 论文",
        url: "https://arxiv.org/abs/1909.08053",
        kind: "paper",
      },
    ],
  },
  {
    id: "pipeline-parallel",
    title: "流水线并行 (Pipeline Parallelism)",
    category: "training",
    summary: "把模型按层切到多卡，micro-batch 流水起来；解决超大模型放不下的问题",
    prerequisites: ["data-parallel"],
    localDocs: ["大模型基础知识/推理并行/5p推理.md"],
    checkpoints: [
      {
        id: "pp-gpipe-1f1b",
        name: "GPipe vs 1F1B 调度",
        mustKnow: `**GPipe**：所有 micro-batch 都 forward 完才开始 backward，显存峰值高但简单。
**1F1B (PipeDream)**：交替 forward 和 backward，稳态时每张卡同时只持有 \`pipeline_stages\` 份激活，**显存大幅降低**。
**Interleaved 1F1B (Megatron)**：把每个 stage 再切成多个 chunk，进一步缩小 bubble。

**bubble 时间** = \`(P-1) / (M + P - 1)\`，P=stage 数，M=micro-batch 数。M 越大 bubble 占比越小，但单个 micro-batch 越小算力利用率越低。`,
        commonMisconceptions: [
          "以为 PP bubble 不可避免就放弃 PP——大模型场景 PP 是必须的",
          "micro-batch 数量随便设——其实要权衡 bubble 和单 batch 算力",
        ],
        interviewAngles: [
          "为什么 1F1B 比 GPipe 省显存？",
          "怎么估算 bubble 占比？",
          "PP 切分的负载怎么平衡？",
        ],
      },
    ],
    resources: [
      { title: "GPipe 论文", url: "https://arxiv.org/abs/1811.06965", kind: "paper" },
      { title: "PipeDream 论文", url: "https://arxiv.org/abs/1806.03377", kind: "paper" },
    ],
  },
  {
    id: "zero-fsdp",
    title: "ZeRO 与 FSDP",
    category: "training",
    summary: "把优化器状态/梯度/参数分片到多卡，让 DP 也能训巨型模型",
    prerequisites: ["data-parallel"],
    localDocs: ["大模型基础知识/推理并行/5p推理.md"],
    checkpoints: [
      {
        id: "zero-stages",
        name: "ZeRO-1 / ZeRO-2 / ZeRO-3 分别切了什么",
        mustKnow: `经典的"优化器状态 vs 梯度 vs 参数"三个层次：
- **ZeRO-1**：只分片**优化器状态**（Adam 的 m/v + fp32 master weight，占总显存最大），通信量和 DDP 一样
- **ZeRO-2**：再分片**梯度**，通信量仍和 DDP 同量级
- **ZeRO-3 / FSDP**：再分片**参数本身**，forward/backward 时需要 all-gather 拿到完整层参数；通信量约为 DDP 的 **1.5×**

显存收益：N 卡 ZeRO-3 单卡参数占用约 \`总参数 / N\`。`,
        commonMisconceptions: [
          "以为 ZeRO-3 显存最省所以一定要用——通信开销可能让训练变慢",
          "把 ZeRO 和 TP 当成互斥的——可以叠加（3D parallelism）",
        ],
        interviewAngles: [
          "ZeRO-3 forward 时怎么拿到完整参数？",
          "ZeRO 和 TP 的取舍？",
          "Optimizer state 为什么这么大？",
        ],
      },
      {
        id: "fsdp-vs-zero",
        name: "PyTorch FSDP 与 DeepSpeed ZeRO 的差异",
        mustKnow: `FSDP 是 PyTorch 原生实现，ZeRO 是 DeepSpeed 出品。功能相似但实现细节有差：
- FSDP 用 \`FlatParameter\` 把多个参数拍平成一个大 tensor 再分片
- FSDP2 改用 per-parameter sharding（DTensor），更灵活、易于和 TP 组合
- 配置上 FSDP 更"PyTorch-native"，ZeRO 更"插件式"`,
        commonMisconceptions: [
          "把 FSDP 当成 ZeRO 的复刻——细节差异会影响性能与可组合性",
        ],
        interviewAngles: [
          "FSDP 和 ZeRO 主要区别？",
          "FSDP2 解决了 FSDP1 的什么问题？",
        ],
      },
    ],
    resources: [
      { title: "ZeRO 论文", url: "https://arxiv.org/abs/1910.02054", kind: "paper" },
      {
        title: "PyTorch FSDP 文档",
        url: "https://pytorch.org/docs/stable/fsdp.html",
        kind: "docs",
      },
    ],
  },
  {
    id: "mixed-precision",
    title: "混合精度训练",
    category: "training",
    summary: "FP16/BF16 算 GEMM，FP32 维持精度；几乎是大模型训练标配",
    prerequisites: [],
    checkpoints: [
      {
        id: "amp-fp16-bf16",
        name: "FP16 vs BF16 vs FP32 master weight",
        mustKnow: `- **FP16**：动态范围窄（约 \`6e-5 ~ 6e4\`），易 underflow/overflow，需要 **loss scaling**
- **BF16**：动态范围和 FP32 一致，精度低，**无需 loss scaling**；现代训练首选
- 即使用 BF16/FP16 算，优化器仍保留 **FP32 master weight**（防止小更新被吞掉）和 **FP32 梯度副本**

GEMM 用低精度（享受 Tensor Core），accumulate 用 FP32，参数更新用 FP32。`,
        commonMisconceptions: [
          "以为 BF16 训练比 FP16 慢——硬件支持下两者吞吐相同",
          "以为有了 BF16 就完全不需要 FP32——优化器状态仍需 FP32",
        ],
        interviewAngles: [
          "为什么 BF16 不用 loss scaling？",
          "FP32 master weight 解决什么问题？",
          "Tensor Core 在哪些精度下加速？",
        ],
      },
    ],
    resources: [
      {
        title: "NVIDIA Mixed Precision Training",
        url: "https://docs.nvidia.com/deeplearning/performance/mixed-precision-training/",
        kind: "docs",
      },
    ],
  },
  {
    id: "activation-recomp",
    title: "梯度累积 & 激活重算 (Gradient Accumulation & Activation Checkpointing)",
    category: "training",
    summary: "两个最常用的「用时间换空间」技巧",
    prerequisites: [],
    checkpoints: [
      {
        id: "grad-accum",
        name: "梯度累积",
        mustKnow: `当显存不够装下目标 batch size 时，把它拆成 N 个 micro-batch，每个 micro-batch 算完 backward 后**不清零梯度**，累加 N 次再 step。等价于一个大 batch 的梯度。

- 配合 DDP 时要用 \`model.no_sync()\` 上下文避免每个 micro-batch 都触发 all-reduce
- BN 统计量不能跨 micro-batch 累加，所以梯度累积下 BN 行为和真大 batch 略有差异`,
        commonMisconceptions: [
          "不知道 no_sync 的存在，导致通信白白翻倍",
        ],
        interviewAngles: [
          "梯度累积下 DDP 怎么避免冗余通信？",
          "梯度累积和真大 batch 完全等价吗？",
        ],
      },
      {
        id: "act-ckpt",
        name: "激活重算 (Activation Checkpointing)",
        mustKnow: `Forward 时**丢弃部分中间激活**，backward 需要时**重新前向计算一遍**。典型做法是每个 Transformer block 做一次 checkpoint：

- 显存收益：激活从 \`O(L)\` 降到 \`O(sqrt(L))\` 或 \`O(1)\`（粒度不同）
- 时间代价：多一次 forward，约 +33% 训练时间
- Selective checkpointing：只重算"算得便宜但占显存大"的部分（如 attention 的 softmax 输出），把比例做得更好`,
        commonMisconceptions: [
          "把所有层都 checkpoint——重算开销太大",
        ],
        interviewAngles: [
          "什么是 selective activation recomputation？",
          "为什么 activation 是训练显存的大头？",
        ],
      },
    ],
    resources: [],
  },
  {
    id: "nccl-collectives",
    title: "NCCL 与集合通信",
    category: "training",
    summary: "all-reduce / all-gather / reduce-scatter 等原语是所有分布式训练的底座",
    prerequisites: [],
    checkpoints: [
      {
        id: "ring-allreduce",
        name: "Ring All-Reduce 算法",
        mustKnow: `把 N 张卡排成环：
1. **Reduce-Scatter 阶段**（N-1 轮）：每轮每张卡发送一份给下家，同时收到一份做累加，结束时每张卡持有总和的一段
2. **All-Gather 阶段**（N-1 轮）：每轮每张卡传播自己持有的一段，结束时所有卡都拿到完整结果

总通信量 = \`2 × (N-1)/N × data\`，几乎与 N 无关；**带宽友好**，是大规模训练的关键。`,
        commonMisconceptions: [
          "以为 all-reduce 是树状广播——大规模下带宽不饱和，ring 更优",
          "以为 NCCL = MPI——NCCL 是 GPU 优化的，深度集成 CUDA stream",
        ],
        interviewAngles: [
          "Ring all-reduce 总通信量是多少？",
          "什么时候 Tree all-reduce 更优？",
          "NCCL 怎么发现拓扑（NVLink/PCIe/IB）？",
        ],
      },
    ],
    resources: [
      {
        title: "NCCL 官方文档",
        url: "https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/",
        kind: "docs",
      },
    ],
  },
];
