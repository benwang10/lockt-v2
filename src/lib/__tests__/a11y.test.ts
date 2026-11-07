import { checkedA11y, handleActivationKey } from '@/lib/a11y';

test('checkedA11y exposes the state both ways (native accessibilityState + aria for web)', () => {
  expect(checkedA11y(true)).toMatchObject({ 'aria-checked': true, accessibilityState: { checked: true, selected: true } });
  expect(checkedA11y(false, true)).toMatchObject({ 'aria-checked': false, 'aria-disabled': true });
});

test('activation key: Space fires once, repeats are swallowed, other keys pass through', () => {
  const onPress = jest.fn();
  const ev = (key: string, repeat = false) => ({ key, repeat, preventDefault: jest.fn() });
  const space = ev(' ');
  expect(handleActivationKey(space, [' '], onPress)).toBe(true);
  expect(space.preventDefault).toHaveBeenCalled();
  expect(handleActivationKey(ev(' ', true), [' '], onPress)).toBe(false);
  const tab = ev('Tab');
  expect(handleActivationKey(tab, [' '], onPress)).toBe(false);
  expect(tab.preventDefault).not.toHaveBeenCalled();
  expect(onPress).toHaveBeenCalledTimes(1);
});
