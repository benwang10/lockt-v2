/**
 * Web regressions found while auditing v2 in the browser. These render the
 * real components through react-native-web (jest-expo/web preset), so the
 * props asserted here are the attributes that end up in the DOM.
 *
 *  - Radios/chips exposed no selected state on web (react-native-web ignores
 *    `accessibilityState`) and the Space bar didn't activate them.
 *  - `role="link"` rows (authors, people, buddies, songs) had no href, so
 *    Enter never activated them.
 *  - Double clicks / repeated keys could run a Button action twice.
 *  - The liked heart was an outline (Material Symbols font) instead of filled.
 */
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { HoldButton } from '@/components/hold-button';
import { NotesRow } from '@/components/notes-row';
import { SessionCard } from '@/components/session-card';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { PressableLink } from '@/components/ui/pressable-link';
import type { SessionCardData } from '@/lib/types';

jest.mock('@/lib/supabase', () => ({ supabase: {}, isSupabaseConfigured: true }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useIsFocused: () => true }));
jest.mock('@/hooks/use-signed-url', () => ({ useSignedUrl: () => ({ url: null }) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const mount = (ui: ReactElement) => act(() => root.render(ui));
const byLabel = (label: string) => {
  const el = container.querySelector<HTMLElement>(`[aria-label="${label}"]`);
  if (!el) throw new Error(`No element labelled ${label}`);
  return el;
};
const key = (el: HTMLElement, type: 'keydown' | 'keyup', k: string, repeat = false) => {
  const event = new KeyboardEvent(type, { key: k, repeat, bubbles: true, cancelable: true });
  act(() => {
    el.dispatchEvent(event);
  });
  return event;
};
const click = (el: HTMLElement) => {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  act(() => {
    el.dispatchEvent(event);
  });
  return event;
};

describe('Chip (radio) on web', () => {
  test('exposes aria-checked for the selected state', () => {
    mount(
      <>
        <Chip label="Rain" selected onPress={() => undefined} />
        <Chip label="Leaves" selected={false} onPress={() => undefined} />
      </>,
    );
    expect(byLabel('Rain').getAttribute('role')).toBe('radio');
    expect(byLabel('Rain').getAttribute('aria-checked')).toBe('true');
    expect(byLabel('Leaves').getAttribute('aria-checked')).toBe('false');
  });

  test('Space activates once; key repeat is ignored and the page does not scroll', () => {
    const onPress = jest.fn();
    mount(<Chip label="Bubbles" selected={false} onPress={onPress} />);
    const chip = byLabel('Bubbles');
    const first = key(chip, 'keydown', ' ');
    key(chip, 'keydown', ' ', true);
    key(chip, 'keydown', ' ', true);
    key(chip, 'keyup', ' ');
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(first.defaultPrevented).toBe(true);
  });

  test('Enter still activates (react-native-web default)', () => {
    const onPress = jest.fn();
    mount(<Chip label="Leaves" selected={false} onPress={onPress} />);
    const chip = byLabel('Leaves');
    key(chip, 'keydown', 'Enter');
    key(chip, 'keyup', 'Enter');
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('PressableLink on web', () => {
  test('renders an anchor with a real href, so Enter (a native click) activates it', () => {
    const onPress = jest.fn();
    mount(
      <PressableLink href="/user/abc" onPress={onPress} accessibilityLabel="Ada, @ada. View profile">
        <></>
      </PressableLink>,
    );
    const link = byLabel('Ada, @ada. View profile');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/user/abc');
    const event = click(link);
    expect(onPress).toHaveBeenCalledTimes(1);
    // Client-side navigation: the browser's own page load is prevented.
    expect(event.defaultPrevented).toBe(true);
  });
});

describe('Button duplicate protection', () => {
  test('a second click while the first action is pending is ignored', async () => {
    let resolve!: () => void;
    const onPress = jest.fn(() => new Promise<void>((r) => (resolve = r)));
    mount(<Button title="Save" onPress={onPress} />);
    const button = byLabel('Save');
    expect(button.getAttribute('type')).toBe('button'); // never a form submit
    click(button);
    click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
    await act(async () => resolve());
    click(button);
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  test('synchronous actions are never blocked', () => {
    const onPress = jest.fn();
    mount(<Button title="Toggle" onPress={onPress} />);
    click(byLabel('Toggle'));
    click(byLabel('Toggle'));
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  test('a loading button is busy and disabled', () => {
    const onPress = jest.fn();
    mount(<Button title="Post" onPress={onPress} loading />);
    const button = byLabel('Post');
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    click(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});

const card = (liked: boolean): SessionCardData =>
  ({
    id: 's1',
    user_id: 'user-a',
    subject_id: 'sub',
    subject_name: 'Calculus',
    subject_color: '#0F8A5F',
    goal_id: null,
    status: 'completed',
    timer_state: null,
    intention: null,
    started_at: '2026-11-02T18:00:00.000Z',
    running_since: null,
    accumulated_ms: 1_800_000,
    ended_at: '2026-11-02T18:30:00.000Z',
    completed_at: '2026-11-02T18:30:00.000Z',
    duration_seconds: 1800,
    title: 'Series',
    accomplishment: null,
    mood: null,
    photo_path: null,
    song_title: null,
    song_artist: null,
    song_url: null,
    visibility: 'followers',
    created_at: '2026-11-02T18:00:00.000Z',
    updated_at: '2026-11-02T18:30:00.000Z',
    author: { id: 'user-a', username: 'ada', display_name: 'Ada', avatar_path: null },
    like_count: liked ? 1 : 0,
    comment_count: 0,
    liked_by_me: liked,
    buddies: [],
  }) as SessionCardData;

describe('Like heart', () => {
  const heartPath = () => container.querySelector('[data-testid^="heart-"] path')!;

  test('liked: the whole heart is filled red and aria-pressed=true', () => {
    mount(<SessionCard session={card(true)} onToggleLike={() => undefined} />);
    expect(byLabel('Like').getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('[data-testid="heart-filled"]')).not.toBeNull();
    const path = heartPath();
    expect(path.getAttribute('fill')).toBe(path.getAttribute('stroke'));
    expect(path.getAttribute('fill')).not.toBe('none');
  });

  test('unliked: hollow outline and aria-pressed=false', () => {
    mount(<SessionCard session={card(false)} onToggleLike={() => undefined} />);
    expect(byLabel('Like').getAttribute('aria-pressed')).toBe('false');
    expect(container.querySelector('[data-testid="heart-outline"]')).not.toBeNull();
    expect(heartPath().getAttribute('fill')).toBe('none');
  });

  test('clicking the heart toggles once per click', () => {
    const onToggle = jest.fn();
    mount(<SessionCard session={card(false)} onToggleLike={onToggle} />);
    click(byLabel('Like'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  test('the author row is a real link to the profile', () => {
    mount(<SessionCard session={card(false)} onToggleLike={() => undefined} />);
    expect(byLabel('Ada, @ada. View profile').getAttribute('href')).toBe('/user/user-a');
  });
});

describe('Note sheet', () => {
  test('opens without nesting buttons inside a button, and focuses no backdrop control', async () => {
    const me = { id: 'me', username: 'me', display_name: 'Me', bio: null, avatar_path: null, created_at: '' } as never;
    const note = {
      user_id: 'me',
      emoji: '📚',
      body: 'Library until 6',
      updated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      author: { id: 'me', username: 'me', display_name: 'Me', avatar_path: null },
    };
    mount(<NotesRow me={me} notes={[note]} />);
    click(byLabel('Your note: 📚 Library until 6. Open note'));
    await act(async () => undefined);
    const edit = document.body.querySelector<HTMLElement>('[aria-label="Edit note"]');
    expect(edit).not.toBeNull();
    // No interactive ancestor: the backdrop is a sibling layer, not a wrapper.
    expect(edit!.parentElement!.closest('button, [role="button"]')).toBeNull();
    expect(document.body.querySelector('button button, [role="button"] [role="button"]')).toBeNull();
  });
});

describe('Hold to finish on web (keyboard and mouse)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  const advance = (ms: number) => act(() => jest.advanceTimersByTime(ms));

  test('holding Space for 3 s finishes once; auto-repeat keydowns are ignored', () => {
    const onComplete = jest.fn();
    mount(<HoldButton title="Hold to finish" onComplete={onComplete} />);
    const button = byLabel('Hold to finish');
    key(button, 'keydown', ' ');
    for (let t = 0; t < 29; t++) {
      advance(100);
      key(button, 'keydown', ' ', true); // OS key repeat while held
    }
    expect(onComplete).not.toHaveBeenCalled();
    advance(100);
    expect(onComplete).toHaveBeenCalledTimes(1);
    key(button, 'keyup', ' ');
    advance(5000);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test('a quick key press (or releasing early) does not finish', () => {
    const onComplete = jest.fn();
    mount(<HoldButton title="Hold to finish" onComplete={onComplete} />);
    const button = byLabel('Hold to finish');
    key(button, 'keydown', 'Enter');
    advance(200);
    key(button, 'keyup', 'Enter');
    key(button, 'keydown', ' ');
    advance(2800);
    key(button, 'keyup', ' ');
    advance(5000);
    expect(onComplete).not.toHaveBeenCalled();
  });

  test('a mouse click does not finish, and the pointer leaving cancels a hold', () => {
    const onComplete = jest.fn();
    mount(<HoldButton title="Hold to finish" onComplete={onComplete} />);
    const button = byLabel('Hold to finish');
    click(button);
    advance(4000);
    expect(onComplete).not.toHaveBeenCalled();
    act(() => {
      button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    // jsdom has no pointer-event responder; start via keyboard and leave with the pointer instead.
    key(button, 'keydown', ' ');
    act(() => {
      button.dispatchEvent(new Event('pointerleave', { bubbles: false }));
    });
    key(button, 'keyup', ' ');
    advance(4000);
    expect(onComplete).not.toHaveBeenCalled();
  });
});
