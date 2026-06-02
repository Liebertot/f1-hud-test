# 赛车模拟器 HUD 高保真前端原型

这是一个纯前端可交互原型，按客户需求实现驾驶舱视角、Canvas 2.5D 动态赛道、Beginner/Advanced HUD、键盘驾驶反馈、鼠标调节反馈、胎温状态机和警告动画。不包含后台、数据采集、localStorage 存储、JSON/CSV 导出。

## 启动方式

推荐在当前目录启动静态服务：

```bash
python3 -m http.server 8080
```

然后在浏览器打开：

```text
http://localhost:8080
```

如果 `8080` 端口被占用，可以换一个端口，例如：

```bash
python3 -m http.server 8123
```

对应打开：

```text
http://localhost:8123
```

也可以直接双击 `index.html` 打开，但用本地服务演示更稳定。

## 文件说明

- `index.html`：页面结构、Canvas 动态赛道容器和 HUD 信息层级。
- `styles.css`：高保真视觉样式、Canvas 赛道叠层、毛玻璃面板、状态色、响应式适配和动画。
- `script.js`：Canvas 2.5D 赛道绘制、键盘/鼠标交互、车辆数值模拟、胎温阈值判断、模式切换。
- `assets/cockpit-shanghai.png`：驾驶舱赛道背景图。

