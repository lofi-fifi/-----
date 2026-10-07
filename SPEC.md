# 考研打卡 App — 需求规格（SPEC）

## 目标用户
一个人（我），考研备考期间每天使用，记录任务、学习时长、签到。

## 技术栈
- Vite + React + TypeScript
- Tailwind CSS
- 数据持久化：localStorage，单键 `kaoyan-app-data`，存一个 JSON
- 无后端、无登录
- 移动端优先，可"添加到主屏幕"

## 视觉风格
- 极简白底黑字，参考 Notion / 番茄钟 App
- 大量留白，圆角 12px，边框 #E5E5E5
- 主色：文字 #111 / 次要文字 #888 / 背景 #FFFFFF / 卡片背景 #FAFAFA
- 字体：系统默认（-apple-system, PingFang SC）
- 完成任务：文字变灰 + 中间划线 + 200ms 过渡
- 不要花哨装饰、不要渐变、不要阴影堆叠

## 页面结构（单页，从上到下）
1. 顶部：考研倒计时「距离 2026 考研还有 XX 天」
2. 鸡汤卡片（随机一条 + 换一条按钮）
3. 签到区（签到按钮 / 连续天数 / 三枚徽章）
4. 今日任务列表（可增删改、点击划掉、显示时长）
5. 右下角悬浮按钮 → 番茄钟面板（底部滑出）
6. 右上角齿轮 → 设置面板（右侧滑出）

## 数据模型
```ts
type Task = {
  id: string;
  text: string;
  done: boolean;
  seconds: number;      // 累计学习秒数
  createdAt: number;
};

type Badge = {
  type: '7d' | '15d' | '30d';
  earnedAt: string;     // YYYY-MM-DD
  streak: number;       // 获得时的连续天数
};

type AppData = {
  version: 1;
  tasks: Record<string, Task[]>;   // key = "2026-10-07"
  checkins: string[];              // ["2026-10-07", ...]
  badges: Badge[];
  settings: {
    examName: string;              // "2026 考研"
    examDate: string;              // "2026-12-20"
    focusMinutes: number;          // 默认 25
    breakMinutes: number;          // 默认 5
    soundOn: boolean;              // 默认 true
    vibrateOn: boolean;            // 默认 true
    customQuotes: string[];
  };
};