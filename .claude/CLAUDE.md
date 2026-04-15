# 全局约定索引

本文件是规则的地图,详细规则放在 [rules/](rules/) 子目录,按需Read。新增规则时优先拆文件,主索引只放一行指引。

## 通用短规则

- **被指出错误时**: 如果错误严重，直接在本文件对应章节补充或修正规则,不再使用error_log.md，错误程度不高，就记录到error_log.md
- **memory vs CLAUDE.md分工**: CLAUDE.md存所有行为约定和错误纠正;memory只存项目状态/偏好,不存行为规则

## 规则清单

- [rules/no_ai_style.md](rules/no_ai_style.md) — 禁用AI腔表达(自我标榜、解释用意、结尾反问、表态铺垫、附和措辞)。**每次对话开始时必须Read此文件**
- [rules/error_log.md](rules/error_log.md) — 历史错误提炼的强制规则(skill触发、code-reviewer流程、归档、打包等),**写代码时必须Read此文件**
