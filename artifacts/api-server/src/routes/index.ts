import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dashboardRouter from "./dashboard";
import sitesRouter from "./sites";
import machinesRouter from "./machines";
import incidentsRouter from "./incidents";
import sloRouter from "./slo";
import remediationRouter from "./remediation";
import simulatorRouter from "./simulator";
import kafkaRouter from "./kafka";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(sitesRouter);
router.use(machinesRouter);
router.use(incidentsRouter);
router.use(sloRouter);
router.use(remediationRouter);
router.use(simulatorRouter);
router.use(kafkaRouter);

export default router;
