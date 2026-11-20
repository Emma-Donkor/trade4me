import { renderToStaticMarkup } from 'react-dom/server';
import Home from './page';

describe('web home page', () => {
  it('renders the shared workspace identifier', () => {
    const html = renderToStaticMarkup(<Home />);

    expect(html).toContain('TradeSense AI');
    expect(html).toContain('tradesense-ai');
  });
});
