import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MarkdownRenderer } from './components/MarkdownRenderer';

describe('MarkdownRenderer formatting', () => {
  it('renders * bullets as list items with no literal asterisks', () => {
    const { container } = render(<MarkdownRenderer content={'* States availability\n  * Familiar with what students\n**Office of Advancement Services and Operations:*\n***both*** and *one*'} />);
    expect(container.querySelectorAll('li').length).toBe(2);
    expect(container.textContent).not.toContain('*');
    expect(container.querySelector('strong')?.textContent).toBe('Office of Advancement Services and Operations:');
  });

  it('strips standalone citation tags with underscores in the filename', () => {
    const { container } = render(<MarkdownRenderer content={'Answer text.\n\n[Abhay_Partap_Singh_Resume_114992.pdf p.1]\n[My_Notes.pdf p. 1, 2]'} />);
    expect(container.textContent).not.toContain('.pdf');
    expect(container.textContent).toContain('Answer text.');
  });
});

describe('streaming citation', () => {
  it('hides an unfinished marker at the end of the text', () => {
    const { container } = render(<MarkdownRenderer content={'Answer text. [Abhay_Partap_Singh_Resume_114992.pdf p.1'} />);
    expect(container.textContent).toBe('Answer text.');
  });
});
