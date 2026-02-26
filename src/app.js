import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import authRoutes from './routes/auth.routes.js';
import inventoryRoutes from './routes/inventory.routes.js';
import categoriesRoutes from './routes/categories.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import auditLogRoutes from './routes/auditLog.routes.js';

const app = express();

app.use(helmet());
app.use(cors());
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/audit-log', auditLogRoutes);

export default app;
