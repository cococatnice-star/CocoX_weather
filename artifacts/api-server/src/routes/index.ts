import { Router, type IRouter } from "express";
import healthRouter from "./health";
import alertsRouter from "./alerts";
import weatherRouter from "./weather";
import hazardsRouter from "./hazards";

const router: IRouter = Router();

router.use(healthRouter);
router.use(alertsRouter);
router.use(weatherRouter);
router.use(hazardsRouter);

export default router;
