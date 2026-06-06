import type { Topic } from "./types";

export const systemTopics: Topic[] = [
  {
    id: "k8s-gpu",
    title: "K8s 与 GPU 调度",
    category: "system",
    summary: "device plugin、拓扑感知、共享、抢占；GPU 集群的基础设施",
    prerequisites: [],
    localDocs: ["basecs/K8s.md", "工具/k8常用命令.md"],
    checkpoints: [
      {
        id: "device-plugin",
        name: "NVIDIA Device Plugin 与资源请求",
        mustKnow: `K8s 本身不认识 GPU——通过 **NVIDIA Device Plugin (DaemonSet)** 把每节点的 GPU 注册成 \`nvidia.com/gpu\` 资源。Pod 用 \`resources.limits.nvidia.com/gpu: 1\` 申请。

调度细节：
- GPU 资源是**整数**，不能像 CPU 那样 fractional（除非用 MIG / time-slicing / vGPU 这些方案）
- 默认按 GPU 数量调度，**不感知拓扑**（同一 NVLink 域内的卡 vs 跨 PCIe 域的卡差别巨大）
- 解决：**NVIDIA GPU Operator + Topology Manager**，让训练 pod 拿到同一 NUMA / 同一 NVLink 组的卡`,
        commonMisconceptions: [
          "以为 K8s 原生支持 GPU——需要 Device Plugin",
          "申请了 8 块 GPU 就认为它们一定互联——可能跨节点跨 PCIe，影响训练",
        ],
        interviewAngles: [
          "Device Plugin 工作原理？",
          "怎么让 K8s 感知 NVLink 拓扑？",
          "MIG 和 vGPU 的区别？",
        ],
      },
      {
        id: "gang-scheduling",
        name: "Gang Scheduling（成组调度）",
        mustKnow: `分布式训练需要 N 个 worker **同时拉起**，否则部分 worker 等不到队友会 OOM/超时。

默认 K8s 调度器一个个调度 pod，可能造成死锁（A 占了 4 卡等 B 的卡，B 占了另外 4 卡等 A）。

解决方案：**Volcano / Kueue / Yunikorn** 等批调度器，提供 \`PodGroup\` 概念——要么全部调度成功，要么全部不调度。`,
        commonMisconceptions: [
          "用默认调度器跑大规模训练——死锁/资源浪费",
        ],
        interviewAngles: [
          "为什么训练需要 gang scheduling？",
          "Volcano 和 Kueue 的区别？",
        ],
      },
    ],
    resources: [
      {
        title: "NVIDIA GPU Operator 文档",
        url: "https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/",
        kind: "docs",
      },
    ],
  },
  {
    id: "model-serving",
    title: "模型服务化",
    category: "system",
    summary: "vLLM / TensorRT-LLM / Triton Inference Server 各自定位",
    prerequisites: [],
    checkpoints: [
      {
        id: "serving-stack",
        name: "推理服务栈选型",
        mustKnow: `- **vLLM**：开源 LLM 推理引擎，强在 throughput（PagedAttention + continuous batching），易部署，社区活跃
- **TensorRT-LLM**：NVIDIA 出品，强在 latency 和深度硬件优化（kernel 融合、in-flight batching、量化）；门槛高但 H100/B200 上极致
- **Triton Inference Server**：NVIDIA 的通用 serving 框架，可以挂任何后端（TRT-LLM、ONNX、Python）；多模型、动态 batching、ensemble 是亮点
- **SGLang**：后起新秀，prefix caching 和结构化输出做得好

部署时常组合：TRT-LLM (compute) + Triton (serving) 是 NVIDIA 推荐栈；vLLM 单独跑也很完整。`,
        commonMisconceptions: [
          "把 vLLM 和 Triton 看成同类——一个是引擎一个是 serving 框架",
        ],
        interviewAngles: [
          "vLLM 和 TensorRT-LLM 怎么选？",
          "Triton Inference Server 解决什么问题？",
        ],
      },
    ],
    resources: [
      { title: "vLLM 文档", url: "https://docs.vllm.ai/", kind: "docs" },
      {
        title: "TensorRT-LLM",
        url: "https://github.com/NVIDIA/TensorRT-LLM",
        kind: "code",
      },
    ],
  },
  {
    id: "observability",
    title: "GPU 监控与可观测性",
    category: "system",
    summary: "DCGM、Prometheus、关键指标：利用率、显存、错误",
    prerequisites: [],
    checkpoints: [
      {
        id: "dcgm-metrics",
        name: "DCGM 与关键 GPU 指标",
        mustKnow: `**DCGM (Data Center GPU Manager)** 是 NVIDIA 出品的 GPU 监控守护进程，通常配 **dcgm-exporter** 暴露 Prometheus metrics。

关键指标：
- \`DCGM_FI_DEV_GPU_UTIL\`：GPU 利用率（**仅表示有 kernel 在跑，不代表算力充分**）
- \`DCGM_FI_DEV_FB_USED / FB_FREE\`：显存使用
- \`DCGM_FI_PROF_SM_ACTIVE / PROF_PIPE_TENSOR_ACTIVE\`：**真正的算力利用率**和 Tensor Core 利用率
- \`DCGM_FI_DEV_XID_ERRORS\`：硬件错误（XID）——大规模训练时 ECC/PCIe 错误极常见
- \`DCGM_FI_DEV_NVLINK_BANDWIDTH_*\`：NVLink 带宽`,
        commonMisconceptions: [
          "只看 GPU_UTIL 不看 PROF_SM_ACTIVE——前者会骗人",
        ],
        interviewAngles: [
          "GPU_UTIL 100% 但训练慢，怎么排查？",
          "XID 错误怎么处理？",
        ],
      },
    ],
    resources: [
      {
        title: "DCGM 文档",
        url: "https://docs.nvidia.com/datacenter/dcgm/",
        kind: "docs",
      },
    ],
  },
];
