import { Router, type IRouter } from "express";
import healthRouter from "./health";
import feedRouter from "./feed";
import tradersRouter from "./traders";
import tradesRouter from "./trades";
import signalsRouter from "./signals";
import copyRouter from "./copy";
import analyticsRouter from "./analytics";
import painRoomsRouter from "./pain_rooms";
import reputationRouter from "./reputation";
import intentsRouter from "./intents";
import marketRouter from "./market";
import followsRouter from "./follows";
import commentsRouter from "./comments";
import valuechainRouter from "./valuechain";
import indexerRouter from "./indexer";

const router: IRouter = Router();

router.use(healthRouter);
router.use(feedRouter);
router.use(tradersRouter);
router.use(tradesRouter);
router.use(signalsRouter);
router.use(copyRouter);
router.use(analyticsRouter);
router.use(painRoomsRouter);
router.use(reputationRouter);
router.use(intentsRouter);
router.use(marketRouter);
router.use(followsRouter);
router.use(commentsRouter);
router.use(valuechainRouter);
router.use(indexerRouter);

export default router;
