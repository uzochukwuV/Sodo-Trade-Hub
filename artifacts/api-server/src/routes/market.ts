import { Router, type IRouter } from "express";
import { getMarketPrices, getNews, getKlines, getMarketVibeSummary } from "../services/market";

const router: IRouter = Router();

router.get("/market/prices", async (req, res) => {
  const prices = await getMarketPrices();
  res.json({ prices });
});

router.get("/market/news", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 10, 20);
  const news = await getNews(limit);
  res.json({ news });
});

router.get("/market/klines/:symbol", async (req, res) => {
  const symbol = decodeURIComponent(req.params.symbol);
  const days = Math.min(Number(req.query.days) || 1, 7);
  const klines = await getKlines(symbol, days);
  res.json({ klines });
});

router.get("/market/vibe", async (req, res) => {
  const [prices, news] = await Promise.all([getMarketPrices(), getNews(5)]);
  const summary = getMarketVibeSummary(prices, news);
  res.json({ summary, prices, news: news.slice(0, 5) });
});

export default router;
