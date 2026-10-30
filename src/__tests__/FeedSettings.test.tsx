import { describe, it, expect, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FeedSettings } from '@/components/FeedSettings'
import { useUserFeedStore } from '@/lib/feed-store'

beforeEach(() => {
  // Partial merge (no `replace`) so the store's action functions are kept —
  // a full replace would wipe `addFeed`/`removeFeed`/etc.
  useUserFeedStore.setState({ userFeeds: [] })
})

describe('FeedSettings', () => {
  it('is collapsed by default and opens the panel on toggle', async () => {
    const user = userEvent.setup()
    render(<FeedSettings />)

    const toggle = screen.getByRole('button', { name: 'Feed settings' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('feed-settings-panel')).toBeNull()

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('feed-settings-panel')).toBeTruthy()
    expect(screen.getByTestId('feed-settings-form')).toBeTruthy()
  })

  it('closes the panel on Escape', async () => {
    const user = userEvent.setup()
    render(<FeedSettings />)
    await user.click(screen.getByRole('button', { name: 'Feed settings' }))
    expect(screen.getByTestId('feed-settings-panel')).toBeTruthy()

    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('feed-settings-panel')).toBeNull()
  })

  it('adds a feed, derives a name from the URL, and lists it as enabled', async () => {
    const user = userEvent.setup()
    render(<FeedSettings />)
    await user.click(screen.getByRole('button', { name: 'Feed settings' }))

    await user.type(
      screen.getByLabelText('Feed URL'),
      'https://myblog.example/rss.xml',
    )
    await user.click(screen.getByRole('button', { name: 'Add feed' }))

    const rows = screen.getAllByTestId('feed-settings-row')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveAttribute('data-enabled', 'true')
    expect(rows[0]).toHaveAttribute('data-feed-url', 'https://myblog.example/rss.xml')
    // Name derived from the host (TLD stripped, title-cased).
    expect(within(rows[0]).getByText('Myblog')).toBeTruthy()
    // No error shown, and the form was reset.
    expect(screen.queryByTestId('feed-settings-error')).toBeNull()
    expect(screen.getByLabelText('Feed URL')).toHaveValue('')

    // The store is actually updated (persist layer included).
    expect(useUserFeedStore.getState().userFeeds).toHaveLength(1)
    expect(useUserFeedStore.getState().userFeeds[0].name).toBe('Myblog')
  })

  it('accepts an explicit name and topic', async () => {
    const user = userEvent.setup()
    render(<FeedSettings />)
    await user.click(screen.getByRole('button', { name: 'Feed settings' }))

    await user.type(screen.getByLabelText('Feed URL'), 'https://openai.com/blog/rss.xml')
    await user.type(screen.getByLabelText(/Name/), 'OpenAI News')
    await user.selectOptions(screen.getByLabelText('Topic'), 'Models')
    await user.click(screen.getByRole('button', { name: 'Add feed' }))

    const row = screen.getByTestId('feed-settings-row')
    expect(within(row).getByText('OpenAI News')).toBeTruthy()
    expect(within(row).getByText('Models')).toBeTruthy()
    expect(useUserFeedStore.getState().userFeeds[0].category).toBe('Models')
  })

  it('shows the SSRF guard rejection verbatim and does not store the feed', async () => {
    const user = userEvent.setup()
    render(<FeedSettings />)
    await user.click(screen.getByRole('button', { name: 'Feed settings' }))

    await user.type(screen.getByLabelText('Feed URL'), 'http://169.254.169.254/latest/meta-data')
    await user.click(screen.getByRole('button', { name: 'Add feed' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      /not allowed|private, loopback, or reserved/i,
    )
    expect(screen.queryByTestId('feed-settings-row')).toBeNull()
    expect(useUserFeedStore.getState().userFeeds).toHaveLength(0)
  })

  it('rejects an empty URL with an inline error', async () => {
    const user = userEvent.setup()
    render(<FeedSettings />)
    await user.click(screen.getByRole('button', { name: 'Feed settings' }))

    await user.click(screen.getByRole('button', { name: 'Add feed' }))

    expect(screen.getByRole('alert')).toHaveTextContent(/feed url/i)
    expect(useUserFeedStore.getState().userFeeds).toHaveLength(0)
  })

  it('rejects a duplicate feed (same URL, different casing) ', async () => {
    const user = userEvent.setup()
    render(<FeedSettings />)
    await user.click(screen.getByRole('button', { name: 'Feed settings' }))

    await user.type(screen.getByLabelText('Feed URL'), 'https://myblog.example/rss.xml')
    await user.click(screen.getByRole('button', { name: 'Add feed' }))
    expect(screen.getAllByTestId('feed-settings-row')).toHaveLength(1)

    // Same feed, different casing — must be treated as a duplicate.
    await user.type(
      screen.getByLabelText('Feed URL'),
      'https://MYBLOG.example/rss.xml',
    )
    await user.click(screen.getByRole('button', { name: 'Add feed' }))

    expect(screen.getByRole('alert')).toHaveTextContent(/already/i)
    expect(screen.getAllByTestId('feed-settings-row')).toHaveLength(1)
  })

  it('toggles a feed off and on', async () => {
    const user = userEvent.setup()
    useUserFeedStore.setState({
      userFeeds: [
        { name: 'My Blog', url: 'https://myblog.example/rss.xml', enabled: true },
      ],
    })
    render(<FeedSettings />)
    await user.click(screen.getByRole('button', { name: 'Feed settings' }))

    const row = screen.getByTestId('feed-settings-row')
    expect(row).toHaveAttribute('data-enabled', 'true')
    expect(within(row).getByRole('button', { name: 'Toggle My Blog' })).toHaveTextContent('On')

    await user.click(within(row).getByRole('button', { name: 'Toggle My Blog' }))
    expect(row).toHaveAttribute('data-enabled', 'false')
    expect(within(row).getByRole('button', { name: 'Toggle My Blog' })).toHaveTextContent('Off')

    await user.click(within(row).getByRole('button', { name: 'Toggle My Blog' }))
    expect(row).toHaveAttribute('data-enabled', 'true')
  })

  it('removes a feed', async () => {
    const user = userEvent.setup()
    useUserFeedStore.setState({
      userFeeds: [
        { name: 'My Blog', url: 'https://myblog.example/rss.xml', enabled: true },
      ],
    })
    render(<FeedSettings />)
    await user.click(screen.getByRole('button', { name: 'Feed settings' }))

    expect(screen.getByTestId('feed-settings-row')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Remove My Blog' }))

    expect(screen.queryByTestId('feed-settings-row')).toBeNull()
    expect(useUserFeedStore.getState().userFeeds).toHaveLength(0)
  })

  it('renames a feed via the inline edit control', async () => {
    const user = userEvent.setup()
    useUserFeedStore.setState({
      userFeeds: [
        { name: 'My Blog', url: 'https://myblog.example/rss.xml', enabled: true },
      ],
    })
    render(<FeedSettings />)
    await user.click(screen.getByRole('button', { name: 'Feed settings' }))

    const row = screen.getByTestId('feed-settings-row')
    await user.click(within(row).getByRole('button', { name: 'Rename My Blog' }))

    const input = screen.getByLabelText('Rename My Blog')
    await user.clear(input)
    await user.type(input, 'Renamed Blog')
    await user.click(screen.getByRole('button', { name: 'Save name for My Blog' }))

    expect(within(row).getByText('Renamed Blog')).toBeTruthy()
    expect(useUserFeedStore.getState().userFeeds[0].name).toBe('Renamed Blog')
  })

  it('shows an empty state when there are no custom feeds', async () => {
    const user = userEvent.setup()
    render(<FeedSettings />)
    await user.click(screen.getByRole('button', { name: 'Feed settings' }))

    expect(screen.getByText(/No custom feeds yet/i)).toBeTruthy()
    expect(screen.queryByTestId('feed-settings-row')).toBeNull()
  })
})
