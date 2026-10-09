import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRouter } from 'next/router'
import ButtonJumpToComment from '@/themes/hexo/components/ButtonJumpToComment'
import ButtonRandomPostMini from '@/themes/hexo/components/ButtonRandomPostMini'

jest.mock('next/router', () => ({ useRouter: jest.fn() }))
jest.mock('@/lib/global', () => ({
  useGlobal: () => ({ locale: { MENU: { WALK_AROUND: 'Random post' } } })
}))
jest.mock('@/lib/config', () => ({
  siteConfig: key => (key === 'HEXO_WIDGET_TO_COMMENT' ? true : '')
}))

it('keeps the comment action keyboard-accessible with a 44px mobile target', async () => {
  const user = userEvent.setup()
  const scroll = jest.spyOn(window, 'scrollTo').mockImplementation(() => {})
  render(
    <>
      <ButtonJumpToComment />
      <div id='comment' />
    </>
  )
  const button = screen.getByRole('button', { name: 'Jump to Comment' })
  expect(button).toHaveClass('w-11', 'h-11', 'lg:w-7', 'lg:h-7')
  button.focus()
  await user.keyboard('{Enter}')
  expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
})

it('keeps the random action keyboard-accessible without changing its route', async () => {
  const user = userEvent.setup()
  const push = jest.fn()
  useRouter.mockReturnValue({ push })
  render(<ButtonRandomPostMini latestPosts={[{ slug: 'article/synthetic' }]} />)
  const button = screen.getByRole('button', { name: 'Random post' })
  expect(button).toHaveClass('w-11', 'h-11', 'lg:w-7', 'lg:h-7')
  button.focus()
  await user.keyboard(' ')
  expect(push).toHaveBeenCalledWith('/article/synthetic')
})
