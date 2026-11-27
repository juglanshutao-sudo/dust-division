《Dust Division》私有试玩构建，源自 `qa/acceptance` 的 `cd251bb`。

**试玩方式**

- [打开私有游戏](https://dust-division-field-operations.bakedtanager.chatgpt.site)。点击 **Enter Sector** 出发，按 **H** 打开中文指南。
- 从下方 Assets 下载 **Dust-Division.html**，保存后双击即可离线游玩。静态服务器使用 **dust-division-web.zip**，解压到站点发布目录即可。
- 盲审可先看 **visual-review.jpg**。**dust-division-acceptance.zip** 收录九张原尺寸截图、逐帧数据、浏览器记录及中文验收报告。

浏览器验收覆盖驾驶、供电建造、编队移位、三阶段守卫、处决、撤离和次日仓库入账。硬件与帧率见 **Acceptance-Report.md**。

[浏览器验收](https://github.com/juglanshutao-sudo/dust-division/actions/runs/45950181927) · [性能基准](https://github.com/juglanshutao-sudo/dust-division/actions/runs/45950181918) · [部署配置](https://github.com/juglanshutao-sudo/dust-division/blob/qa/acceptance/.github/workflows/pages.yml)
