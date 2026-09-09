# Import the supplied employee and salary data

The importer reads the source workbooks directly, so private employee, bank and statutory data is not copied into application source code.

1. Confirm `.env` points to the target PostgreSQL/Supabase database.
2. Run the migration and generate Prisma client:

   ```powershell
   npm run prisma:generate
   npm run prisma:migrate -- --name employee_asset_register_fields
   ```

3. Set these two temporary PowerShell variables exactly as shown:

   ```powershell
   $env:SOURCE_MASTER_XLSX = 'C:\Users\pavan\Desktop\yutai\2.o\Main Master sheet of Employee data - 1-4-2026 -Final.xlsx'
   $env:SOURCE_SALARY_XLSX = 'C:\Users\pavan\Desktop\yutai\2.o\SALARY SHEET NEW_JUL- 2026.xlsx'
   ```

4. Run `npm run import:legacy`.

The import upserts each unique `EMP####` record, creates locations/departments/designations from both files, loads cities, outlet models/branches, role codes and department codes from **Color and codes Scheme**, and records each source row as employee history for traceability. Re-running it updates the same permanent IDs rather than creating duplicates.

Review skipped-row totals in the terminal. Rows with an invalid/missing `EMP####`, employee name, or 10-digit mobile number are intentionally skipped for review rather than silently guessed.
