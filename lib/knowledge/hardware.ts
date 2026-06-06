import type { Topic } from "./types";

export const hardwareTopics: Topic[] = [
  {
    id: "gpu-arch",
    title: "GPU 架构基础",
    category: "hardware",
    summary: "SM / warp / memory hierarchy；是理解所有 GPU 优化的前提",
    prerequisites: [],
    checkpoints: [
      {
        id: "sm-warp",
        name: "SM、warp、thread block 的关系",
        mustKnow: `- **SM (Streaming Multiprocessor)**：GPU 的基本计算单元，一张 H100 有 132 个 SM
- **Thread block** 在编程模型层面调度到一个 SM，独占其共享内存（shared memory）
- **Warp** = 32 个连续 thread，是硬件**实际调度**和**SIMD 执行**的单位
- Block 内的 thread 会被划成多个 warp；同一 warp 内的 thread 必须执行相同指令（divergence 会导致串行化）`,
        commonMisconceptions: [
          "把 thread 当成独立调度单位——硬件是按 warp 调度",
          "以为 SM 越多线程就越快——更多看内存带宽 / 算力比",
        ],
        interviewAngles: [
          "Warp divergence 是什么，怎么避免？",
          "Block size 怎么选？",
          "Occupancy 是什么，越高越好吗？",
        ],
      },
      {
        id: "mem-hierarchy",
        name: "GPU 内存层级",
        mustKnow: `带宽与延迟（H100 量级）：
- **HBM (global memory)**：~3 TB/s，延迟数百周期，几十 GB 容量
- **L2 cache**：~5 TB/s，~50MB
- **L1 / Shared memory**：~20 TB/s，每 SM ~228KB（可配置切分）
- **Registers**：最快，每 SM 几 MB，按 thread 分

优化目标常常是"让数据尽量留在更靠近 SM 的层级"，比如 tile + shared memory 是 GEMM 优化的核心。`,
        commonMisconceptions: [
          "把 shared memory 当成 cache——它是程序员显式管理的 scratchpad",
          "忽略 HBM 带宽是 decode 阶段的硬瓶颈",
        ],
        interviewAngles: [
          "为什么 LLM decode 是 memory-bound？",
          "Shared memory 和 L1 是什么关系？",
          "如何用 nsight-compute 看带宽利用率？",
        ],
      },
    ],
    resources: [
      {
        title: "CUDA C Programming Guide",
        url: "https://docs.nvidia.com/cuda/cuda-c-programming-guide/",
        kind: "docs",
      },
    ],
  },
  {
    id: "roofline",
    title: "Roofline 性能分析",
    category: "hardware",
    summary: "用「算力屋顶」+「带宽屋顶」诊断你的 kernel 卡在哪",
    prerequisites: ["gpu-arch"],
    localDocs: ["大模型相关知识/性能估算/性能估算.md"],
    checkpoints: [
      {
        id: "roofline-basic",
        name: "Arithmetic Intensity 与判断瓶颈",
        mustKnow: `**Arithmetic Intensity (AI)** = FLOPs / Bytes accessed from HBM
**Roofline**：性能（FLOPs/s）≤ min(峰值算力, AI × 峰值带宽)

- AI < 拐点（ridge point）→ memory-bound，优化方向是**减少访存 / 提高复用**（tile、融合、量化降字节）
- AI > 拐点 → compute-bound，优化方向是**提高算力利用率**（用 Tensor Core、减少 stall）

典型例子：
- LLM **prefill**（GEMM 大）：compute-bound
- LLM **decode**（GEMV）：memory-bound——所以投机解码、量化、KV cache 都瞄准它`,
        commonMisconceptions: [
          "看到 GPU 利用率高就以为没问题——可能只是 memory-bound 在等内存",
          "把 SM 占用率（occupancy）当成性能指标——是上限不是结果",
        ],
        interviewAngles: [
          "怎么判断 kernel 是 compute-bound 还是 memory-bound？",
          "FlashAttention 提升的本质是什么（从 roofline 角度）？",
          "decode 阶段的 AI 大概是多少？",
        ],
      },
    ],
    resources: [
      {
        title: "Roofline 模型 (Berkeley)",
        url: "https://crd.lbl.gov/divisions/amcr/computer-science-amcr/par/research/roofline/",
        kind: "blog",
      },
    ],
  },
  {
    id: "triton-intro",
    title: "Triton 入门",
    category: "hardware",
    summary: "OpenAI 出的 Python DSL，写 GPU kernel 比 CUDA 简单得多",
    prerequisites: ["gpu-arch"],
    checkpoints: [
      {
        id: "triton-vs-cuda",
        name: "Triton 与 CUDA 的关系与适用场景",
        mustKnow: `Triton 把 GPU 编程的粒度从"thread"提升到"**block of threads**"——你只写 block 级逻辑，编译器自动处理 thread 间的并行、向量化、shared memory 调度。

适合场景：
- 自定义算子（fused attention、量化 GEMM、特殊 LayerNorm 等）
- 不需要榨干 PTX 最后一滴性能、但要比 PyTorch op 拼接快很多

FlashAttention、Liger Kernel、vLLM 的很多 kernel 都用 Triton。`,
        commonMisconceptions: [
          "以为 Triton 完全取代 CUDA——极致优化的 GEMM 仍是 CUTLASS/手写 PTX 更强",
        ],
        interviewAngles: [
          "Triton 相比 CUDA 让你少写了什么？",
          "什么时候 Triton 性能能追上 CUDA？",
        ],
      },
    ],
    resources: [
      { title: "Triton 文档", url: "https://triton-lang.org/", kind: "docs" },
    ],
  },
];
