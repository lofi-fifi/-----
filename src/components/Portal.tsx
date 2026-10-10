import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

/**
 * 把浮层渲染到 `document.body` 下。
 *
 * **为什么必须这么做**：主页的 `<main>` 上带着 `relative z-10`，
 * 这会创建出一个**层叠上下文** —— 它内部所有元素的 `z-index`
 * 都只在 `main` 这一层里比较，**逃不出去**。
 *
 * 于是底部 Tab 栏（`z-30`，是 `main` 的兄弟节点）会整体压在 `main` 之上，
 * 把里面写 `z-40` / `z-50` 的菜单、提示条、弹窗按钮全部盖住。
 * 表现就是「删除键不见了」—— 而且只有位置最低的那一项会被盖到，
 * 更容易被当成偶发问题。
 *
 * 渲染到 body 之后就脱离了那个上下文，`z-index` 才真正是全局的。
 */
export default function Portal({ children }: { children: ReactNode }) {
  // 服务端渲染（renderToString）时没有 document —— 浮层本来也不需要渲染
  if (typeof document === 'undefined') return null
  return createPortal(children, document.body)
}
