import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Dashboard } from '@/pages/Dashboard';
import { CustomersList } from '@/pages/CustomersList';
import { CustomerForm } from '@/pages/CustomerForm';
import { CustomerDetail } from '@/pages/CustomerDetail';
import { SuppliersList } from '@/pages/SuppliersList';
import { SupplierForm } from '@/pages/SupplierForm';
import { SupplierDetail } from '@/pages/SupplierDetail';
import { ProductsList } from '@/pages/ProductsList';
import { ProductForm } from '@/pages/ProductForm';
import { ProductDetail } from '@/pages/ProductDetail';
import { Settings } from '@/pages/Settings';
import { Login } from '@/pages/Login';
import { Calendar } from '@/pages/Calendar';
import { AppointmentForm } from '@/pages/AppointmentForm';
import { TechniciansList } from '@/pages/TechniciansList';
import { TechnicianForm } from '@/pages/TechnicianForm';
import { NotesList } from '@/pages/NotesList';
import { NoteForm } from '@/pages/NoteForm';
import { FinanceList } from '@/pages/FinanceList';
import { TransactionForm } from '@/pages/TransactionForm';
import { JobsList } from '@/pages/JobsList';
import { JobForm } from '@/pages/JobForm';
import { UsersList } from '@/pages/UsersList';
import { UserForm } from '@/pages/UserForm';
import { Reports } from '@/pages/Reports';
import { InvoiceTracker } from '@/pages/InvoiceTracker';
import { BudgetTracker } from '@/pages/BudgetTracker';
import { NewBudget } from '@/pages/NewBudget';
import { OCTracker } from '@/pages/OCTracker';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { useCustomers } from '@/hooks/useCustomers';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useAppointments } from '@/hooks/useAppointments';
import { useTechnicians } from '@/hooks/useTechnicians';
import { useNotes } from '@/hooks/useNotes';
import { useTransactions } from '@/hooks/useTransactions';
import { useJobs } from '@/hooks/useJobs';
import { useProducts } from '@/hooks/useProducts';
import { Toaster } from '@/components/ui/sonner';
import { SearchProvider, useSearch } from '@/contexts/SearchContext';
import { useEffect } from 'react';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppContent() {
  const { isAuthenticated, user, users, deleteUser, toggleUserStatus } = useAuth();
  const { customers, addCustomer, updateCustomer, deleteCustomer } = useCustomers();
  const { suppliers, categories, addSupplier, updateSupplier, deleteSupplier } = useSuppliers();
  const { appointments, addAppointment, updateAppointment, deleteAppointment, completeAppointment } = useAppointments();
  const { technicians, addTechnician, updateTechnician, deleteTechnician } = useTechnicians();
  const { notes, addNote, updateNote, deleteNote } = useNotes();
  const { transactions, addTransaction, updateTransaction, deleteTransaction } = useTransactions();
  const { jobs, addJob, updateJob, deleteJob } = useJobs();
  const { products: productsFromHook } = useProducts();
  const { setData } = useSearch();
  
  // Sync data to search context
  useEffect(() => {
    setData({ customers, suppliers, appointments, technicians, notes, transactions, jobs });
  }, [customers, suppliers, appointments, technicians, notes, transactions, jobs]);
  
  const currentUser = user ? { id: user.id, name: user.name } : { id: '', name: '' };
  
  const customersForFinance = customers.map(c => ({ id: c.id, firstName: c.firstName, lastName: c.lastName }));
  const suppliersForFinance = suppliers.map(s => ({ id: s.id, companyName: s.name }));
  const jobsForFinance = jobs.map(j => ({ id: j.id, jobNumber: j.jobNumber, title: j.title, clientName: j.clientName, status: j.status }));
  
  const customersForJobs = customers.map(c => ({ id: c.id, firstName: c.firstName, lastName: c.lastName, phone: c.phone, cuit: c.cuit, address: c.address }));
  const techniciansForJobs = technicians.map(t => ({ id: t.id, firstName: t.firstName, lastName: t.lastName, isActive: t.isActive }));
  const productsForJobs = productsFromHook.map(p => ({ 
    id: p.id, 
    name: p.name, 
    salePrice: p.salePrice 
  }));

  // make sure to consider if you need authentication for certain routes
  return (
    <Routes>
      <Route 
        path="/login" 
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        } 
      />
      
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout>
              <Dashboard 
                customers={customers} 
                suppliers={suppliers}
                products={productsFromHook}
                appointments={appointments}
                technicians={technicians}
                notes={notes}
                transactions={transactions}
                jobs={jobs}
              />
            </Layout>
          </ProtectedRoute>
        }
      />
      
      {/* Customers */}
      <Route
        path="/customers"
        element={
          <ProtectedRoute>
            <Layout>
              <CustomersList customers={customers} onDelete={deleteCustomer} />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/customers/new"
        element={
          <ProtectedRoute>
            <Layout>
              <CustomerForm customers={customers} onSave={addCustomer} onUpdate={updateCustomer} />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/customers/:id"
        element={
          <ProtectedRoute>
            <Layout>
              <CustomerDetail 
                customers={customers} 
                onDelete={deleteCustomer}
                appointments={appointments}
                jobs={jobs}
                transactions={transactions}
                notes={notes}
              />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/customers/:id/edit"
        element={
          <ProtectedRoute>
            <Layout>
              <CustomerForm customers={customers} onSave={addCustomer} onUpdate={updateCustomer} />
            </Layout>
          </ProtectedRoute>
        }
      />
      
      {/* Suppliers */}
      <Route
        path="/suppliers"
        element={
          <ProtectedRoute>
            <Layout>
              <SuppliersList suppliers={suppliers} categories={categories} onDelete={deleteSupplier} />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/suppliers/new"
        element={
          <ProtectedRoute>
            <Layout>
              <SupplierForm suppliers={suppliers} categories={categories} onSave={addSupplier} onUpdate={updateSupplier} />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/suppliers/:id"
        element={
          <ProtectedRoute>
            <Layout>
              <SupplierDetail suppliers={suppliers} onDelete={deleteSupplier} />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/suppliers/:id/edit"
        element={
          <ProtectedRoute>
            <Layout>
              <SupplierForm suppliers={suppliers} categories={categories} onSave={addSupplier} onUpdate={updateSupplier} />
            </Layout>
          </ProtectedRoute>
        }
      />
      
      {/* Products */}
      <Route
        path="/products"
        element={
          <ProtectedRoute>
            <Layout>
              <ProductsList />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/products/new"
        element={
          <ProtectedRoute>
            <Layout>
              <ProductForm />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/products/:id"
        element={
          <ProtectedRoute>
            <Layout>
              <ProductDetail />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/products/:id/edit"
        element={
          <ProtectedRoute>
            <Layout>
              <ProductForm />
            </Layout>
          </ProtectedRoute>
        }
      />
      
      {/* Calendar / Agenda */}
      <Route
        path="/calendar"
        element={
          <ProtectedRoute>
            <Layout>
              <Calendar 
                appointments={appointments}
                technicians={technicians}
                onDelete={deleteAppointment}
                onStatusChange={(id, newStatus) => {
                  const apt = appointments.find(a => a.id === id);
                  if (apt) {
                    const updatedApt = { ...apt, status: newStatus, recurrenceEndDate: apt.recurrenceEndDate ?? '' };
                    updateAppointment(id, updatedApt, apt.clientName, apt.clientPhone, apt.productNames, apt.technicianNames);
                  }
                }}
                onComplete={completeAppointment}
                currentUserName={user?.name || 'Usuario'}
              />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/calendar/new"
        element={
          <ProtectedRoute>
            <Layout>
              <AppointmentForm 
                appointments={appointments}
                customers={customers}
                products={productsFromHook}
                technicians={technicians}
                onSave={addAppointment}
                onUpdate={updateAppointment}
              />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/calendar/:id/edit"
        element={
          <ProtectedRoute>
            <Layout>
              <AppointmentForm 
                appointments={appointments}
                customers={customers}
                products={productsFromHook}
                technicians={technicians}
                onSave={addAppointment}
                onUpdate={updateAppointment}
              />
            </Layout>
          </ProtectedRoute>
        }
      />

      {/* Technicians */}
      <Route
        path="/technicians"
        element={
          <ProtectedRoute>
            <Layout>
              <TechniciansList technicians={technicians} onDelete={deleteTechnician} />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/technicians/new"
        element={
          <ProtectedRoute>
            <Layout>
              <TechnicianForm technicians={technicians} onSave={addTechnician} onUpdate={updateTechnician} />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/technicians/:id/edit"
        element={
          <ProtectedRoute>
            <Layout>
              <TechnicianForm technicians={technicians} onSave={addTechnician} onUpdate={updateTechnician} />
            </Layout>
          </ProtectedRoute>
        }
      />

      {/* Notes */}
      <Route
        path="/notes"
        element={
          <ProtectedRoute>
            <Layout>
              <NotesList 
                notes={notes} 
                currentUser={currentUser}
                onDelete={deleteNote}
                onStatusChange={(id, status) => {
                  const note = notes.find(n => n.id === id);
                  if (note) {
                    updateNote(id, { ...note, status });
                  }
                }}
              />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/notes/new"
        element={
          <ProtectedRoute>
            <Layout>
              <NoteForm 
                notes={notes}
                customers={customers}
                currentUser={currentUser}
                onSave={addNote}
                onUpdate={updateNote}
              />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/notes/:id/edit"
        element={
          <ProtectedRoute>
            <Layout>
              <NoteForm 
                notes={notes}
                customers={customers}
                currentUser={currentUser}
                onSave={addNote}
                onUpdate={updateNote}
              />
            </Layout>
          </ProtectedRoute>
        }
      />
      
      {/* Finance */}
      <Route
        path="/finance"
        element={
          <ProtectedRoute>
            <Layout>
              <FinanceList transactions={transactions} onDelete={deleteTransaction} />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/finance/income/new"
        element={
          <ProtectedRoute>
            <Layout>
              <TransactionForm 
                transactions={transactions}
                customers={customersForFinance}
                suppliers={suppliersForFinance}
                jobs={jobsForFinance}
                onSave={addTransaction}
                onUpdate={updateTransaction}
              />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/finance/expense/new"
        element={
          <ProtectedRoute>
            <Layout>
              <TransactionForm 
                transactions={transactions}
                customers={customersForFinance}
                suppliers={suppliersForFinance}
                jobs={jobsForFinance}
                onSave={addTransaction}
                onUpdate={updateTransaction}
              />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/finance/:id/edit"
        element={
          <ProtectedRoute>
            <Layout>
              <TransactionForm 
                transactions={transactions}
                customers={customersForFinance}
                suppliers={suppliersForFinance}
                jobs={jobsForFinance}
                onSave={addTransaction}
                onUpdate={updateTransaction}
              />
            </Layout>
          </ProtectedRoute>
        }
      />

      {/* Jobs */}
      <Route
        path="/jobs"
        element={
          <ProtectedRoute>
            <Layout>
              <JobsList 
                jobs={jobs}
                products={productsFromHook}
                transactions={transactions}
                onDelete={deleteJob}
                onStatusChange={(id: string, status: any) => { const job = jobs.find(j => j.id === id); if (job) updateJob(id, { ...job, status } as any, job.clientName, job.clientPhone, job.clientCuit, job.technicianNames); }}
              />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/jobs/new"
        element={
          <ProtectedRoute>
            <Layout>
              <JobForm 
                jobs={jobs}
                customers={customersForJobs}
                technicians={techniciansForJobs}
                products={productsForJobs}
                transactions={transactions}
                onSave={addJob}
                onUpdate={updateJob}
              />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/jobs/:id/edit"
        element={
          <ProtectedRoute>
            <Layout>
              <JobForm 
                jobs={jobs}
                customers={customersForJobs}
                technicians={techniciansForJobs}
                products={productsForJobs}
                transactions={transactions}
                onSave={addJob}
                onUpdate={updateJob}
              />
            </Layout>
          </ProtectedRoute>
        }
      />

      {/* Presupuestos */}
      <Route
        path="/presupuestos"
        element={
          <ProtectedRoute>
            <Layout>
              <BudgetTracker 
                jobs={jobs}
                onStatusChange={(id: string, status: any) => { const job = jobs.find(j => j.id === id); if (job) updateJob(id, { ...job, status } as any, job.clientName, job.clientPhone, job.clientCuit, job.technicianNames); }}
              />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/presupuestos/nuevo"
        element={
          <ProtectedRoute>
            <Layout>
              <NewBudget
                customers={customersForJobs}
                products={productsForJobs}
                jobs={jobs}
                onSave={addJob}
                onUpdate={updateJob}
                currentUser={currentUser}
              />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/presupuestos/:id/editar"
        element={
          <ProtectedRoute>
            <Layout>
              <NewBudget
                customers={customersForJobs}
                products={productsForJobs}
                jobs={jobs}
                onSave={addJob}
                onUpdate={updateJob}
                currentUser={currentUser}
              />
            </Layout>
          </ProtectedRoute>
        }
      />

      {/* OC Pendientes */}
      <Route
        path="/oc-pendientes"
        element={
          <ProtectedRoute>
            <Layout>
              <OCTracker 
                jobs={jobs}
                onStatusChange={(id: string, status: any) => { const job = jobs.find(j => j.id === id); if (job) updateJob(id, { ...job, status } as any, job.clientName, job.clientPhone, job.clientCuit, job.technicianNames); }}
              />
            </Layout>
          </ProtectedRoute>
        }
      />

      {/* Cobranzas */}
      <Route
        path="/cobranzas"
        element={
          <ProtectedRoute>
            <Layout>
              <InvoiceTracker 
                jobs={jobs}
                onStatusChange={(id: string, status: any) => { const job = jobs.find(j => j.id === id); if (job) updateJob(id, { ...job, status } as any, job.clientName, job.clientPhone, job.clientCuit, job.technicianNames); }}
              />
            </Layout>
          </ProtectedRoute>
        }
      />

      {/* Reports */}
      <Route
        path="/reports"
        element={
          <ProtectedRoute>
            <Layout>
              <Reports 
                customers={customers}
                transactions={transactions}
                jobs={jobs}
                products={productsFromHook}
                appointments={appointments}
                technicians={technicians}
              />
            </Layout>
          </ProtectedRoute>
        }
      />

      {/* Users */}
      <Route
        path="/users"
        element={
          <ProtectedRoute>
            <Layout>
              <UsersList 
                users={users as any} 
                currentUser={user as any}
                onUpdate={() => {}}
                onDelete={deleteUser}
                onToggleStatus={toggleUserStatus}
              />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/users/new"
        element={
          <ProtectedRoute>
            <Layout>
              <UserForm />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/users/:id/edit"
        element={
          <ProtectedRoute>
            <Layout>
              <UserForm />
            </Layout>
          </ProtectedRoute>
        }
      />

      {/* Settings */}
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Layout>
              <Settings />
            </Layout>
          </ProtectedRoute>
        }
      />
      
      <Route path="*" element={<Navigate to={isAuthenticated ? "/" : "/login"} replace />} />
    </Routes>
  );
}

function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <SearchProvider>
          <AppContent />
          <Toaster position="top-right" />
        </SearchProvider>
      </AuthProvider>
    </HashRouter>
  );
}

export default App;
