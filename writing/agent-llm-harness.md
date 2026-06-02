故事是这样子的，最近用 Codex 有点上瘾，因为我有多个 GPT 的 API Provider，所以自然就想到用 CC Switch 的本地路由 + 自动故障转移，让 Codex 始终只看到一个本地入口，后面再由 CC Switch 负责切换 Provider。一开始因为 API Key 登录模式没办法使用插件，研究了一下发现官方不支持，也有挺多相关的 issue，不想等官方解决，于是就选择用 Codex++ 解决，每次用外部 Launcher 启动 Codex App，也可以注入很多自定义的脚本。然后前几天 Codex App 出了移动端的功能，可以手机连电脑上的 Codex App，我也想尝试一下，毕竟可以出门的时候也可以和 Codex 交互，不用一直在家里等着。于是我就想让 ChatGPT 账号登录的同时 model_provider 走 API ，这里还是用 Codex++ 的中转注入(兼容增强）模式解决，官方登录的同时混入 API。到这里我还没有意识到什么。

直到昨天早上，我发现我的 Codex App 插件那一栏变灰了，之前也经常遇到这种问题可能是 Codex++后端又没连上吧，于是我就重启了 Codex App。这次插件倒是没变灰，过了两分钟之后我发现对话 disconnect 了，它居然提示我额度不足，让我升级到 Plus（因为我是 Free 账号额度肯定两分钟就用光了） ，现在我没有走自定义的 Provider，走的是官方的额度。于是我就让 Codex 自己去修一下修好了，等过了一会它居然又变成插件变灰的情况了。邪门的是，我去看了一下 config.toml 里面居然是空的，我又改回到正确的方式了，然后过了一会 base_url 居然被改成了 Provider 自己的 url，按照 CC Switch 的本地路由这里应该是 http://127.0.0.1:15721/v1 的。这时候我就在想是不是其他的 Codex 线程改了我的配置？我看了一下可能还真是，而且不只是 config.toml，auth.json等好几个配置文件都在频繁被修改，不只是 Codex 在改，CC Switch 在改，就连 Codex++ 的管理工具都有改我配置的记录。

我寻思这下坏了，于是我就让 Codex 把目前的状态对齐到我想要的状态。也就是：

- `model_provider=custom`
- `base_url=http://127.0.0.1:15721/v1`
- `requires_openai_auth=true`
- 补 mixed API bearer token
- Codex++ `officialMixApiKey=true`
- Codex++ `ccsLinkEnabled=false`
- CC Switch `preserveCodexOfficialAuthOnSwitch=true`

同时，为了防止它再坏，我又加了守卫/防漂移机制：

- `codex-config-guard.sh` 检查关键状态是否脱离目标
- LaunchAgent 定时运行监听文件状态
- 给 `~/.codex/config.toml` 加 `uchg`，需要我手动解锁才能改

到这里，我觉得应该不会出问题了，直到昨天下午 Guard 开始反复报 CC Switch local proxy or preserve-auth settings drifted，直接原因是：`~/.cc-switch/settings.json` 里的<br>
`preserveCodexOfficialAuthOnSwitch=false`，我尝试给它改到 true，过了一会 CC Switch又把它改回来了，因为自动故障转移会尝试去修改 Provider，它会先改自己的这个字段。于是我就把 Guard 增加了 `--repair-ccswitch-preserve-auth`，到目前为止还没出现问题。

我去看了 CC Switch 前天刚刚更新的v3.16.1，在这个版本里面它明确支持“官方 ChatGPT/Codex OAuth 登录态保留在 `auth.json`，第三方 API token 写到 `config.toml`”，并且修了本地路由接管、热切换时把 live config 覆盖掉的问题。但这个能力 **默认关闭**，必须手动开启。
Codex++这边呢，昨天晚上刚刚更新的 v1.1.9，修了 mixed API 模式丢 key。

我把 CC Switch 更新到了v3.16.1，可以说，对于我目前的情况，CC Switch 最新版大部分都修掉了：

- 官方 ChatGPT / Codex OAuth 登录态保留：第三方 token 放 `config.toml`，官方登录态留在 `auth.json`。
- 本地路由接管更稳：热切换时 endpoint 仍保持本地代理，不把真实上游泄回 live config。
- 修了接管期间 OAuth 被清空/覆盖的路径。
- 修了 Chat Completions 上游里 tool_search、插件、connector、自定义工具恢复成 Responses 形态的问题。

它把 **CC Switch 自己这条链路里的几个大坑** 修了不少，但没有解决我整套 Codex App + Codex++ + CC Switch 组合里的“状态所有权”问题：

- **它只能管 CC Switch 自己的写入**<br>
  v3.16.1 加的是 CC Switch 内部的 per-app 锁、接管判断、备份/占位符判断。它管不了Codex++、Codex App、其他 agent、手动脚本去改 `~/.codex/config.toml` 或 `auth.json`。

- **修改模型映射后仍要重启 Codex**<br>
  官方升级提醒里也说，Codex 启动时读 `model_catalog_json`，改映射后仍需重启 Codex 才能刷新 `/model` 菜单。

- **本地接管状态仍然是复杂状态**<br>
  release 里还专门提醒：接管期间 live 文件会临时指向代理，编辑 Provider 时看到的是数据库里的配置，不是 live 文件。这说明状态被拆成 DB、backup、live config、proxy runtime 几层，复杂性还在。
<br>
后来我意识到，自动故障转移本身就是一个会写状态的机制。它不是单纯地“观察哪个 Provider 可用”，而是会更新当前 Provider、失败计数、路由状态，甚至在某些路径下影响 Codex 的 live 配置。所以问题不是要禁止它写，而是要规定它只能写自己该写的那一层。而且每个人都应该负责自己该做的那一层，就比如对我这个问题来说：

- Codex App：保持 ChatGPT 登录态<br>
    `~/.codex/auth.json` 应该是 `auth_mode="chatgpt"`，不能有 `OPENAI_API_KEY`
  <br>
- Codex 配置：永远只指向本地代理<br>
    `~/.codex/config.toml` 里应该是 `base_url="http://127.0.0.1:15721/v1"`
  <br>
- CC Switch：只负责本地代理和 Provider failover<br>
    failover 可以开，但它不应该把 Codex 改成直连 Provider
  <br>
- Codex++：保持 official login + mixed API<br>
    也就是官方登录态保留，API 能力通过本地代理混入
  <br>
- 守卫：只保护边界，不接管业务<br>
    它只该修 `preserveCodexOfficialAuthOnSwitch=true` 这类关键漂移，不应该乱改 provider 队列

而且每次升级相关工具的时候，都要做验收方便回滚。

以上这一切就是为了维护这一套状态，需要付出的“代价”。我这只是几个小小的工具耦合都这么麻烦，真实上线的、复杂度稍微上一点的系统都会有各种各样的问题出现，更不要说很多问题都是系统越来越复杂之后才可以发现的、积重难返的问题，很多坑在前期压根看不到。我甚至不敢想，在 AI 时代，越来越多系统将混入由 AI 生成的大量“屎山代码”。到那时，人和 AI 究竟谁还能真正掌控系统的走向？

再多说两句，前段时间不是总说 Harness Engineering 吗？刚开始我还理解成“就是外面包了一层工具调用框架”，假如说 LLM 的能力越来越强的话，那是不是就不需要 Harness 了？现在我对这个问题有了一点自己的看法：LLM 本身像一个很强但会犯错的操作员，Harness 决定它是在裸奔改系统，还是在一个有护栏、有审计、有回滚、有职责边界的环境里工作，更广义地说，它是**把一个不稳定、概率性的智能体放进可控系统里的整套约束环境**。
它包括：
- **权限边界**：能读什么、能写什么、哪些操作必须确认
- **配置所有权**：谁能改哪个文件，谁只能读
- **工作流**：先快照，再修改，再验证，再记录
- **守卫机制**：漂移检测、自愈、报警
- **上下文规范**：AGENTS.md、skills、项目规则、维护日志
- **回滚能力**：快照、备份、版本控制
- **观测性**：日志、状态检查、健康检查
- **默认策略**：遇到冲突时保守，遇到不确定先确认
模型是很重要，但是它也只是其中一个变量，真正决定系统稳不稳，还需要依赖外面这一整圈治理结构。而且越是强的 Agent，Harness 越重要。因为能力越强，误操作的半径也越大。
简单来说：
Agent = LLM + Harness
Harness = Tools + Permissions + Context + Policy + Memory + Verification + Recovery + Observability + ....？
所以，AI 时代，工程上的东西目前看来似乎还缺不了。
以上。
