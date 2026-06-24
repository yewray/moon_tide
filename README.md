# Moon Tide

千叶（Chiba）月亮高度和潮位可视化网页。上图显示月亮高度，下图显示 JMA 潮位高度。

## 启动

本机如果没有 `node` 命令，可以使用 Codex 内置 Node：

```sh
cd /Users/yew/Documents/moon
/Users/yew/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node server.js
```

看到下面输出后，在浏览器打开页面：

```text
Chiba moon/tide app running at http://127.0.0.1:4173
```

页面地址：

```text
http://127.0.0.1:4173
```

如果本机已经安装 Node，也可以运行：

```sh
npm start
```

## 基本用法

- `Start` / `End`: 选择开始日期和结束日期。
- `Start hour` / `End hour`: 选择开始和结束小时。
- 默认时间范围是 `Start 18:00` 到 `End 06:00`。
- `‹` / `›`: 日期范围整体前移或后移一天，小时不变。
- `<<` / `>>`: 日期范围整体前移或后移一个月，小时不变。
- `Refresh`: 按当前设置重新加载数据。

## 选项

- `Invert tide Y`: 反转潮位图 y 轴。
- `Hide moon < 0`: 隐藏地平线以下的月亮高度。
- `Absolute moon`: 月亮高度使用绝对值显示。
- `Hide moon after zenith`: 月亮过天顶后隐藏月亮曲线，并隐藏 `Set` 标记。
- `20:00-04:00 only`: 保留全量数据，但突出显示 `20:00-04:00`，其它时间段变暗。

## 图表说明

- 月亮图标记：
    - `Rise`: 月出。
    - `Set`: 月落。
    - `Zenith`: 月亮高度局部最大点。
- 潮位图标记：
    - `High`: 局部高潮。
    - `Low`: 局部低潮。
- x 轴显示日期和周几。
- 周六、周日日期标红。

## 数据来源和限制

- 地点固定为 Chiba。
- 潮位数据读取本地文件：
    - `data/QL-2026.txt`
    - `data/QL-2027.txt`
- 月亮高度通过 JPL Horizons 在线计算，所以使用时需要联网。
- 支持日期范围：`2026-01-01` 到 `2027-12-31`。
- 单次查询最长约 3 个月（93 天）。

## 测试

```sh
/Users/yew/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test
```

或本机有 Node 时：

```sh
npm test
```
