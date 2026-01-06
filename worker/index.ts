import {createHonoApp} from "./routes/app";
import {handler} from "./queue/handler";
export {EvaluationWorkflow} from "./workflows/evaluation.workflow";

const honoApp = createHonoApp();

const app = {
	...honoApp,
	queue: handler,
}

export default app;
