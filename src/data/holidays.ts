/**
 * 节日彩蛋。
 *
 * 显示位置：主页倒计时卡片里、天数下面的一行小字。一天最多一条，
 * 撞车时按 priority 取数字最小的那个。
 *
 * 三种触发方式，一条只要命中任意一个条件就算：
 *   gregorian   公历固定日期，'MM-DD'
 *   lunar       农历月日（正=1、冬=11、腊=12）。春节端午中秋这些每年都在飘，
 *               交给 Intl 的中国农历去算，不用手写年份表。闰月不触发。
 *   examOffset  距离考试的天数：0 = 考试当天，-1 = 考完第一天
 *
 * 想加节日直接往数组里加一条，代码一行都不用改。
 */

export type Holiday = {
  /** 稳定标识，方便测试和排查 */
  id: string
  /** 只是给人看的名字，界面上不显示 */
  name: string
  gregorian?: string
  lunar?: { month: number; day: number }
  examOffset?: number
  message: string
  /** 同一天撞车时的优先级，数字小的优先 */
  priority: number
}

/**
 * 优先级约定：
 *   10  考研专属（考试相关永远压过节日）
 *   20  农历节日
 *   25  国庆（撞中秋时让给中秋，撞其他公历节日时它赢）
 *   30  其他公历节日
 */
export const HOLIDAYS: readonly Holiday[] = [
  /* ---------------- 考研专属 ---------------- */
  {
    id: 'exam-100',
    name: '倒计时 100 天',
    examOffset: 100,
    message: '还有 100 天。三位数变两位数，就从今天开始。',
    priority: 10,
  },
  {
    id: 'exam-50',
    name: '倒计时 50 天',
    examOffset: 50,
    message: '还有 50 天。够把专业课再过两遍，也够放弃两遍。',
    priority: 10,
  },
  {
    id: 'exam-30',
    name: '倒计时 30 天',
    examOffset: 30,
    message: '还有 30 天。够背 30 遍单词，也够放弃 30 次。',
    priority: 10,
  },
  {
    id: 'exam-7',
    name: '倒计时 7 天',
    examOffset: 7,
    message: '最后一周。别学新东西了，把会的捡牢。',
    priority: 10,
  },
  {
    id: 'exam-3',
    name: '倒计时 3 天',
    examOffset: 3,
    message: '还有 3 天。现在开始调作息，比多背两道题有用。',
    priority: 10,
  },
  {
    id: 'exam-1',
    name: '考前一天',
    examOffset: 1,
    message: '明天就考了。今晚早点睡，去考场别忘带准考证。',
    priority: 10,
  },
  {
    id: 'exam-today',
    name: '考试当天',
    examOffset: 0,
    message: '今天考试。深呼吸，把会做的先做完。',
    priority: 10,
  },
  {
    id: 'exam-done',
    name: '考完第一天',
    examOffset: -1,
    message: '考完了。不管怎么样，先睡一觉。',
    priority: 10,
  },

  /* ---------------- 农历节日 ---------------- */
  {
    id: 'spring-festival',
    name: '春节',
    lunar: { month: 1, day: 1 },
    message: '春节快乐。别人在走亲戚，你在走真题。',
    priority: 20,
  },
  {
    id: 'lantern-festival',
    name: '元宵节',
    lunar: { month: 1, day: 15 },
    message: '元宵节。汤圆要吃，单词也要背。',
    priority: 20,
  },
  {
    id: 'dragon-boat',
    name: '端午',
    lunar: { month: 5, day: 5 },
    message: '端午。粽子甜咸都行，录取通知书只有一种。',
    priority: 20,
  },
  {
    id: 'qixi',
    name: '七夕',
    lunar: { month: 7, day: 7 },
    message: '七夕。牛郎织女一年见一次，你和图书馆天天见。',
    priority: 20,
  },
  {
    id: 'mid-autumn',
    name: '中秋',
    lunar: { month: 8, day: 15 },
    message: '中秋。月亮挺圆的，你的复习进度最好也圆一点。',
    priority: 20,
  },

  /* ---------------- 公历节日 ---------------- */
  {
    id: 'new-year',
    name: '元旦',
    gregorian: '01-01',
    message: '又是新的一年。去年这个时候，你也说过「今年一定要不一样」。',
    priority: 30,
  },
  {
    id: 'valentine',
    name: '情人节',
    gregorian: '02-14',
    message: '这个情人节大概又是你一个人过吧，似乎已然很久了呢。',
    priority: 30,
  },
  {
    id: 'april-fools',
    name: '愚人节',
    gregorian: '04-01',
    message: '愚人节。今天唯一不能骗自己的，是错题本上那些红叉。',
    priority: 30,
  },
  {
    id: 'labour-day',
    name: '劳动节',
    gregorian: '05-01',
    message: '劳动节快乐。你桌上那堆书，也是一种劳动。',
    priority: 30,
  },
  {
    id: 'youth-day',
    name: '青年节',
    gregorian: '05-04',
    message: '青年节。二十几岁，还输得起。',
    priority: 30,
  },
  {
    id: 'love-day',
    name: '520',
    gregorian: '05-20',
    message: '今天要是没人对你说「我爱你」，那就自己说一遍。',
    priority: 30,
  },
  {
    id: 'childrens-day',
    name: '儿童节',
    gregorian: '06-01',
    message: '儿童节快乐。虽然你已经很久不是儿童了。',
    priority: 30,
  },
  {
    id: 'national-day',
    name: '国庆节',
    gregorian: '10-01',
    message: '祝伟大的祖国生日快乐！',
    priority: 25,
  },
  {
    id: 'singles-day',
    name: '光棍节',
    gregorian: '11-11',
    message: '双十一。购物车可以清空，倒计时不行。',
    priority: 30,
  },
  {
    id: 'christmas-eve',
    name: '平安夜',
    gregorian: '12-24',
    message: '平安夜。别人在拆礼物，你在拆卷子。',
    priority: 30,
  },
  {
    id: 'christmas',
    name: '圣诞节',
    gregorian: '12-25',
    message: '圣诞快乐。图书馆今天也开着。',
    priority: 30,
  },
  {
    id: 'new-years-eve',
    name: '跨年前夜',
    gregorian: '12-31',
    message: '今年最后一天。明年见。',
    priority: 30,
  },
]
