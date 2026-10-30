// Worker entry: only the fetch handler is exported (workerd rejects non-handler named exports).
import app from './index';
export default app;
