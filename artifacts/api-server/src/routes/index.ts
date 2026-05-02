import { Router, type IRouter } from "express";
import healthRouter from "./health";
import feedRouter from "./feed";
import tradersRouter from "./traders";
import tradesRouter from "./trades";
import signalsRouter from "./signals";
import copyRouter from "./copy";
import analyticsRouter from "./analytics";
import painRoomsRouter from "./pain_rooms";

const router: IRouter = Router();

router.use(healthRouter);
router.use(feedRouter);
router.use(tradersRouter);
router.use(tradesRouter);
router.use(signalsRouter);
router.use(copyRouter);
router.use(analyticsRouter);
router.use(painRoomsRouter);

export default router;
