import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Home from './page';

describe('Home', () => {
  it('renders the technical foundation placeholder', () => {
    render(<Home />);

    expect(screen.getByRole('heading', { name: 'BichoCoin' })).toBeInTheDocument();
    expect(screen.getByText('The web foundation is running.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open API live health' })).toHaveAttribute(
      'href',
      'http://localhost:3001/health/live',
    );
  });
});
