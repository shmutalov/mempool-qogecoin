import { query } from '../../utils/axios-query';
import priceUpdater, { PriceFeed, PriceHistory } from '../price-updater';

class ExbitronApi implements PriceFeed {
  public name: string = 'Exbitron';
  public currencies: string[] = ['USD'];

  public url: string = 'https://www.exbitron.com/api/v2/peatio/public/markets/qoge{CURRENCY}/tickers';
  public urlHist: string = "";

  private currencyMap = { 'USD': 'usdt' };

  constructor() {
  }

  public async $fetchPrice(currency): Promise<number> {
    let mapped = this.currencyMap[currency]
    const response = await query(this.url.replace('{CURRENCY}', mapped));
    return response ? parseInt(response['last'], 10) : -1;
  }

  public async $fetchRecentPrice(currencies: string[], type: 'hour' | 'day'): Promise<PriceHistory> {
    return [];
  }
}

export default ExbitronApi;
