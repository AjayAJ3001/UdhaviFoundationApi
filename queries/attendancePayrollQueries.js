// queries/attendancePayrollQueries.js
const db = require('../database/connection');

// ==========================================
// SALARY CONFIGURATION QUERIES
// ==========================================

/**
 * Create or update salary configuration for a service provider
 */
const upsertSalaryConfig = async (configData) => {
    const {
        booking_id,
        service_provider_id,
        customer_id,
        monthly_salary,
        per_day_salary,
        working_days_per_month = 26,
        pf_percentage = 12.00,
        pf_enabled = true,
        effective_from_date,
        created_by
    } = configData;

    try {
        const query = `
            INSERT INTO sp_salary_config (
                booking_id, service_provider_id, customer_id, monthly_salary, 
                per_day_salary, working_days_per_month, pf_percentage, pf_enabled,
                effective_from_date, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                monthly_salary = VALUES(monthly_salary),
                per_day_salary = VALUES(per_day_salary),
                working_days_per_month = VALUES(working_days_per_month),
                pf_percentage = VALUES(pf_percentage),
                pf_enabled = VALUES(pf_enabled),
                updated_at = CURRENT_TIMESTAMP
        `;
        
        const [result] = await db.execute(query, [
            booking_id, service_provider_id, customer_id, monthly_salary,
            per_day_salary, working_days_per_month, pf_percentage, pf_enabled,
            effective_from_date, created_by
        ]);
        
        return result;
    } catch (error) {
        console.error('Upsert salary config error:', error);
        throw error;
    }
};

/**
 * Get salary configuration by booking ID
 */
const getSalaryConfigByBooking = async (booking_id) => {
    try {
        const query = `
            SELECT 
                sc.*,
                ai_sp.full_name as provider_name,
                ai_sp.email as provider_email,
                ai_c.full_name as customer_name
            FROM sp_salary_config sc
            JOIN account_information ai_sp ON sc.service_provider_id = ai_sp.registration_id
            JOIN account_information ai_c ON sc.customer_id = ai_c.registration_id
            WHERE sc.booking_id = ? AND sc.is_active = TRUE
            ORDER BY sc.effective_from_date DESC
            LIMIT 1
        `;
        
        const [rows] = await db.execute(query, [booking_id]);
        return rows[0];
    } catch (error) {
        console.error('Get salary config error:', error);
        throw error;
    }
};

/**
 * Get active salary configuration for a service provider
 */
const getActiveSalaryConfig = async (service_provider_id) => {
    try {
        const query = `
            SELECT * FROM sp_salary_config
            WHERE service_provider_id = ? 
            AND is_active = TRUE
            AND (effective_to_date IS NULL OR effective_to_date >= CURDATE())
            ORDER BY effective_from_date DESC
            LIMIT 1
        `;
        
        const [rows] = await db.execute(query, [service_provider_id]);
        return rows[0];
    } catch (error) {
        console.error('Get active salary config error:', error);
        throw error;
    }
};

// ==========================================
// ATTENDANCE QUERIES
// ==========================================

/**
 * Punch In - Record check-in time with location
 */
const punchIn = async (attendanceData) => {
    const {
        service_provider_id,
        customer_id,
        booking_id,
        attendance_date,
        check_in_time,
        check_in_latitude,
        check_in_longitude,
        created_by
    } = attendanceData;

    try {
        const query = `
            INSERT INTO sp_attendance (
                service_provider_id, customer_id, booking_id, attendance_date,
                check_in_time, check_in_latitude, check_in_longitude,
                status, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PRESENT', ?)
            ON DUPLICATE KEY UPDATE
                check_in_time = VALUES(check_in_time),
                check_in_latitude = VALUES(check_in_latitude),
                check_in_longitude = VALUES(check_in_longitude),
                status = 'PRESENT',
                updated_at = CURRENT_TIMESTAMP
        `;
        
        const [result] = await db.execute(query, [
            service_provider_id, customer_id, booking_id, attendance_date,
            check_in_time, check_in_latitude, check_in_longitude, created_by
        ]);
        
        return result;
    } catch (error) {
        console.error('Punch in error:', error);
        throw error;
    }
};

/**
 * Punch Out - Record check-out time with location
 */
const punchOut = async (attendanceData) => {
    const {
        service_provider_id,
        attendance_date,
        check_out_time,
        check_out_latitude,
        check_out_longitude
    } = attendanceData;

    try {
        // First check if check-in exists
        const checkQuery = `
            SELECT attendance_id, check_in_time 
            FROM sp_attendance 
            WHERE service_provider_id = ? AND attendance_date = ?
        `;
        const [checkRows] = await db.execute(checkQuery, [service_provider_id, attendance_date]);
        
        if (checkRows.length === 0) {
            throw new Error('No check-in record found for this date');
        }

        // Calculate total hours
        const query = `
            UPDATE sp_attendance
            SET check_out_time = ?,
                check_out_latitude = ?,
                check_out_longitude = ?,
                total_hours = TIMESTAMPDIFF(MINUTE, check_in_time, ?) / 60,
                updated_at = CURRENT_TIMESTAMP
            WHERE service_provider_id = ? AND attendance_date = ?
        `;
        
        const [result] = await db.execute(query, [
            check_out_time, check_out_latitude, check_out_longitude,
            check_out_time, service_provider_id, attendance_date
        ]);
        
        return result;
    } catch (error) {
        console.error('Punch out error:', error);
        throw error;
    }
};

/**
 * Manual Attendance Entry - For missed punch in/out
 */
const manualAttendanceEntry = async (attendanceData) => {
    const {
        service_provider_id,
        customer_id,
        booking_id,
        attendance_date,
        check_in_time,
        check_out_time,
        status,
        notes,
        created_by
    } = attendanceData;

    try {
        const query = `
            INSERT INTO sp_attendance (
                service_provider_id, customer_id, booking_id, attendance_date,
                check_in_time, check_out_time, status, is_manual_entry,
                notes, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, ?, ?)
            ON DUPLICATE KEY UPDATE
                check_in_time = VALUES(check_in_time),
                check_out_time = VALUES(check_out_time),
                status = VALUES(status),
                is_manual_entry = TRUE,
                notes = VALUES(notes),
                updated_at = CURRENT_TIMESTAMP
        `;
        
        const [result] = await db.execute(query, [
            service_provider_id, customer_id, booking_id, attendance_date,
            check_in_time, check_out_time, status, notes, created_by
        ]);
        
        // Log the manual entry in history
        if (result.insertId) {
            await logAttendanceHistory(
                result.insertId,
                'MANUAL_ENTRY',
                null,
                `Manual entry: ${status}`,
                notes,
                created_by
            );
        }
        
        return result;
    } catch (error) {
        console.error('Manual attendance entry error:', error);
        throw error;
    }
};

/**
 * Mark Delay with notes
 */
const markDelay = async (delayData) => {
    const {
        service_provider_id,
        attendance_date,
        delay_minutes,
        notes,
        updated_by
    } = delayData;

    try {
        const query = `
            UPDATE sp_attendance
            SET status = 'LATE',
                delay_minutes = ?,
                notes = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE service_provider_id = ? AND attendance_date = ?
        `;
        
        const [result] = await db.execute(query, [
            delay_minutes, notes, service_provider_id, attendance_date
        ]);
        
        return result;
    } catch (error) {
        console.error('Mark delay error:', error);
        throw error;
    }
};

/**
 * Get attendance for a specific date
 */
const getAttendanceByDate = async (service_provider_id, attendance_date) => {
    try {
        const query = `
            SELECT 
                a.*,
                ai_sp.full_name as provider_name,
                ai_c.full_name as customer_name
            FROM sp_attendance a
            JOIN account_information ai_sp ON a.service_provider_id = ai_sp.registration_id
            JOIN account_information ai_c ON a.customer_id = ai_c.registration_id
            WHERE a.service_provider_id = ? AND a.attendance_date = ?
        `;
        
        const [rows] = await db.execute(query, [service_provider_id, attendance_date]);
        return rows[0];
    } catch (error) {
        console.error('Get attendance by date error:', error);
        throw error;
    }
};

/**
 * Get monthly attendance for a service provider
 */
const getMonthlyAttendance = async (service_provider_id, month, year) => {
    try {
        const query = `
            SELECT 
                a.*,
                ai_c.full_name as customer_name
            FROM sp_attendance a
            JOIN account_information ai_c ON a.customer_id = ai_c.registration_id
            WHERE a.service_provider_id = ?
            AND MONTH(a.attendance_date) = ?
            AND YEAR(a.attendance_date) = ?
            ORDER BY a.attendance_date ASC
        `;
        
        const [rows] = await db.execute(query, [service_provider_id, month, year]);
        return rows;
    } catch (error) {
        console.error('Get monthly attendance error:', error);
        throw error;
    }
};

/**
 * Get attendance statistics for a month
 */
const getMonthlyAttendanceStats = async (service_provider_id, month, year) => {
    try {
        const query = `
            SELECT 
                COUNT(*) as total_days_marked,
                SUM(CASE WHEN status = 'PRESENT' THEN 1 ELSE 0 END) as present_days,
                SUM(CASE WHEN status = 'ABSENT' THEN 1 ELSE 0 END) as absent_days,
                SUM(CASE WHEN status = 'LATE' THEN 1 ELSE 0 END) as late_days,
                SUM(CASE WHEN status = 'LEAVE' THEN 1 ELSE 0 END) as leave_days,
                SUM(CASE WHEN status = 'HALF_DAY' THEN 0.5 ELSE 0 END) as half_days,
                SUM(total_hours) as total_hours_worked,
                SUM(delay_minutes) as total_delay_minutes
            FROM sp_attendance
            WHERE service_provider_id = ?
            AND MONTH(attendance_date) = ?
            AND YEAR(attendance_date) = ?
        `;
        
        const [rows] = await db.execute(query, [service_provider_id, month, year]);
        return rows[0];
    } catch (error) {
        console.error('Get monthly attendance stats error:', error);
        throw error;
    }
};

/**
 * Get all service providers with attendance for a customer
 */
const getCustomerServiceProvidersAttendance = async (customer_id, month, year) => {
    try {
        const query = `
            SELECT 
                a.service_provider_id,
                ai.full_name as provider_name,
                a.booking_id,
                COUNT(*) as total_days_marked,
                SUM(CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END) as present_days,
                SUM(CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END) as absent_days,
                SUM(CASE WHEN a.status = 'LATE' THEN 1 ELSE 0 END) as late_days,
                SUM(CASE WHEN a.status = 'LEAVE' THEN 1 ELSE 0 END) as leave_days
            FROM sp_attendance a
            JOIN account_information ai ON a.service_provider_id = ai.registration_id
            WHERE a.customer_id = ?
            AND MONTH(a.attendance_date) = ?
            AND YEAR(a.attendance_date) = ?
            GROUP BY a.service_provider_id, ai.full_name, a.booking_id
        `;
        
        const [rows] = await db.execute(query, [customer_id, month, year]);
        return rows;
    } catch (error) {
        console.error('Get customer service providers attendance error:', error);
        throw error;
    }
};

// ==========================================
// LEAVE MANAGEMENT QUERIES
// ==========================================

/**
 * Apply for leave
 */
const applyLeave = async (leaveData) => {
    const {
        service_provider_id,
        customer_id,
        booking_id,
        leave_type,
        start_date,
        end_date,
        reason,
        is_paid = false
    } = leaveData;

    try {
        const query = `
            INSERT INTO sp_leave (
                service_provider_id, customer_id, booking_id, leave_type,
                start_date, end_date, total_days, reason, is_paid, status
            ) VALUES (?, ?, ?, ?, ?, ?, DATEDIFF(?, ?) + 1, ?, ?, 'PENDING')
        `;
        
        const [result] = await db.execute(query, [
            service_provider_id, customer_id, booking_id, leave_type,
            start_date, end_date, end_date, start_date, reason, is_paid
        ]);
        
        return result;
    } catch (error) {
        console.error('Apply leave error:', error);
        throw error;
    }
};

/**
 * Approve/Reject leave
 */
const updateLeaveStatus = async (leave_id, status, approved_by, rejection_reason = null) => {
    try {
        const query = `
            UPDATE sp_leave
            SET status = ?,
                approved_by = ?,
                approved_date = CURRENT_TIMESTAMP,
                rejection_reason = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE leave_id = ?
        `;
        
        const [result] = await db.execute(query, [status, approved_by, rejection_reason, leave_id]);
        
        // If approved, mark attendance as leave
        if (status === 'APPROVED' && result.affectedRows > 0) {
            await markLeaveDaysInAttendance(leave_id);
        }
        
        return result;
    } catch (error) {
        console.error('Update leave status error:', error);
        throw error;
    }
};

/**
 * Mark leave days in attendance table
 */
const markLeaveDaysInAttendance = async (leave_id) => {
    try {
        const query = `
            INSERT INTO sp_attendance (
                service_provider_id, customer_id, booking_id, attendance_date,
                status, notes
            )
            SELECT 
                l.service_provider_id,
                l.customer_id,
                l.booking_id,
                DATE_ADD(l.start_date, INTERVAL n DAY) as attendance_date,
                'LEAVE',
                CONCAT(l.leave_type, ' - ', l.reason)
            FROM sp_leave l
            CROSS JOIN (
                SELECT 0 as n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 
                UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9
                UNION SELECT 10 UNION SELECT 11 UNION SELECT 12 UNION SELECT 13 UNION SELECT 14
                UNION SELECT 15 UNION SELECT 16 UNION SELECT 17 UNION SELECT 18 UNION SELECT 19
                UNION SELECT 20 UNION SELECT 21 UNION SELECT 22 UNION SELECT 23 UNION SELECT 24
                UNION SELECT 25 UNION SELECT 26 UNION SELECT 27 UNION SELECT 28 UNION SELECT 29
                UNION SELECT 30
            ) numbers
            WHERE l.leave_id = ?
            AND DATE_ADD(l.start_date, INTERVAL n DAY) <= l.end_date
            ON DUPLICATE KEY UPDATE
                status = 'LEAVE',
                notes = CONCAT(VALUES(notes))
        `;
        
        const [result] = await db.execute(query, [leave_id]);
        return result;
    } catch (error) {
        console.error('Mark leave days error:', error);
        throw error;
    }
};

/**
 * Get leave history for a service provider
 */
const getLeaveHistory = async (service_provider_id, status = null) => {
    try {
        let query = `
            SELECT 
                l.*,
                ai_c.full_name as customer_name,
                ai_approved.full_name as approved_by_name
            FROM sp_leave l
            JOIN account_information ai_c ON l.customer_id = ai_c.registration_id
            LEFT JOIN account_information ai_approved ON l.approved_by = ai_approved.registration_id
            WHERE l.service_provider_id = ?
        `;
        
        const params = [service_provider_id];
        
        if (status) {
            query += ' AND l.status = ?';
            params.push(status);
        }
        
        query += ' ORDER BY l.applied_date DESC';
        
        const [rows] = await db.execute(query, params);
        return rows;
    } catch (error) {
        console.error('Get leave history error:', error);
        throw error;
    }
};

/**
 * Get pending leaves for a customer
 */
const getPendingLeaves = async (customer_id) => {
    try {
        const query = `
            SELECT 
                l.*,
                ai_sp.full_name as provider_name,
                ai_sp.email as provider_email
            FROM sp_leave l
            JOIN account_information ai_sp ON l.service_provider_id = ai_sp.registration_id
            WHERE l.customer_id = ? AND l.status = 'PENDING'
            ORDER BY l.applied_date ASC
        `;
        
        const [rows] = await db.execute(query, [customer_id]);
        return rows;
    } catch (error) {
        console.error('Get pending leaves error:', error);
        throw error;
    }
};

// ==========================================
// PAYROLL QUERIES
// ==========================================

/**
 * Generate monthly payroll for a service provider
 */
const generatePayroll = async (payrollData) => {
    const {
        service_provider_id,
        month,
        year,
        created_by
    } = payrollData;

    try {
        // Get salary configuration
        const salaryConfig = await getActiveSalaryConfig(service_provider_id);
        if (!salaryConfig) {
            throw new Error('No active salary configuration found');
        }

        // Get attendance stats
        const attendanceStats = await getMonthlyAttendanceStats(service_provider_id, month, year);
        
        // Calculate earnings
        const presentDays = (attendanceStats.present_days || 0) + (attendanceStats.half_days || 0);
        const earnedSalary = presentDays * salaryConfig.per_day_salary;
        
        // Calculate deductions
        const pfDeduction = salaryConfig.pf_enabled ? 
            (earnedSalary * (salaryConfig.pf_percentage / 100)) : 0;
        
        const netSalary = earnedSalary - pfDeduction;
        
        // Generate payroll reference
        const payrollRef = `PR-${year}-${String(month).padStart(2, '0')}-${String(service_provider_id).padStart(4, '0')}`;
        
        // Insert payroll record
        const query = `
            INSERT INTO sp_payroll (
                payroll_reference, service_provider_id, customer_id, booking_id,
                salary_config_id, period_month, period_year,
                period_start_date, period_end_date,
                total_working_days, present_days, absent_days, leave_days,
                late_days, half_days,
                gross_salary, per_day_salary, earned_salary,
                pf_deduction, other_deductions, total_deductions, net_salary,
                payment_status, created_by
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?,
                DATE(CONCAT(?, '-', LPAD(?, 2, '0'), '-01')),
                LAST_DAY(DATE(CONCAT(?, '-', LPAD(?, 2, '0'), '-01'))),
                ?, ?, ?, ?, ?, ?,
                ?, ?, ?,
                ?, 0, ?, ?,
                'PENDING', ?
            )
        `;
        
        const [result] = await db.execute(query, [
            payrollRef,
            service_provider_id,
            salaryConfig.customer_id,
            salaryConfig.booking_id,
            salaryConfig.salary_config_id,
            month,
            year,
            year, month, year, month,
            salaryConfig.working_days_per_month,
            attendanceStats.present_days || 0,
            attendanceStats.absent_days || 0,
            attendanceStats.leave_days || 0,
            attendanceStats.late_days || 0,
            attendanceStats.half_days || 0,
            salaryConfig.monthly_salary,
            salaryConfig.per_day_salary,
            earnedSalary,
            pfDeduction,
            pfDeduction,
            netSalary,
            created_by
        ]);
        
        return {
            payroll_id: result.insertId,
            payroll_reference: payrollRef,
            net_salary: netSalary
        };
    } catch (error) {
        console.error('Generate payroll error:', error);
        throw error;
    }
};

/**
 * Get payroll by ID
 */
const getPayrollById = async (payroll_id) => {
    try {
        const query = `
            SELECT 
                p.*,
                ai_sp.full_name as provider_name,
                ai_sp.email as provider_email,
                ai_c.full_name as customer_name,
                sc.pf_percentage
            FROM sp_payroll p
            JOIN account_information ai_sp ON p.service_provider_id = ai_sp.registration_id
            JOIN account_information ai_c ON p.customer_id = ai_c.registration_id
            JOIN sp_salary_config sc ON p.salary_config_id = sc.salary_config_id
            WHERE p.payroll_id = ?
        `;
        
        const [rows] = await db.execute(query, [payroll_id]);
        return rows[0];
    } catch (error) {
        console.error('Get payroll by ID error:', error);
        throw error;
    }
};

/**
 * Get payroll for a specific month
 */
const getPayrollByMonth = async (service_provider_id, month, year) => {
    try {
        const query = `
            SELECT 
                p.*,
                ai_c.full_name as customer_name
            FROM sp_payroll p
            JOIN account_information ai_c ON p.customer_id = ai_c.registration_id
            WHERE p.service_provider_id = ?
            AND p.period_month = ?
            AND p.period_year = ?
        `;
        
        const [rows] = await db.execute(query, [service_provider_id, month, year]);
        return rows[0];
    } catch (error) {
        console.error('Get payroll by month error:', error);
        throw error;
    }
};

/**
 * Get all payrolls for a service provider
 */
const getAllPayrolls = async (service_provider_id) => {
    try {
        const query = `
            SELECT 
                p.*,
                ai_c.full_name as customer_name
            FROM sp_payroll p
            JOIN account_information ai_c ON p.customer_id = ai_c.registration_id
            WHERE p.service_provider_id = ?
            ORDER BY p.period_year DESC, p.period_month DESC
        `;
        
        const [rows] = await db.execute(query, [service_provider_id]);
        return rows;
    } catch (error) {
        console.error('Get all payrolls error:', error);
        throw error;
    }
};

/**
 * Get payrolls by customer (for all their service providers)
 */
const getPayrollsByCustomer = async (customer_id, month = null, year = null) => {
    try {
        let query = `
            SELECT 
                p.*,
                ai_sp.full_name as provider_name,
                ai_sp.email as provider_email
            FROM sp_payroll p
            JOIN account_information ai_sp ON p.service_provider_id = ai_sp.registration_id
            WHERE p.customer_id = ?
        `;
        
        const params = [customer_id];
        
        if (month && year) {
            query += ' AND p.period_month = ? AND p.period_year = ?';
            params.push(month, year);
        }
        
        query += ' ORDER BY p.period_year DESC, p.period_month DESC, ai_sp.full_name ASC';
        
        const [rows] = await db.execute(query, params);
        return rows;
    } catch (error) {
        console.error('Get payrolls by customer error:', error);
        throw error;
    }
};

/**
 * Update payroll payment status
 */
const updatePayrollPaymentStatus = async (payroll_id, paymentData) => {
    const {
        payment_status,
        payment_mode,
        payment_reference,
        payment_date,
        payment_processed_by
    } = paymentData;

    try {
        const query = `
            UPDATE sp_payroll
            SET payment_status = ?,
                payment_mode = ?,
                payment_reference = ?,
                payment_date = ?,
                payment_processed_by = ?,
                processed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE payroll_id = ?
        `;
        
        const [result] = await db.execute(query, [
            payment_status,
            payment_mode,
            payment_reference,
            payment_date,
            payment_processed_by,
            payroll_id
        ]);
        
        return result;
    } catch (error) {
        console.error('Update payroll payment status error:', error);
        throw error;
    }
};

/**
 * Mark payroll as paid
 */
const markPayrollAsPaid = async (payroll_id, paymentData) => {
    const {
        payment_mode,
        payment_reference,
        payment_processed_by
    } = paymentData;

    try {
        const query = `
            UPDATE sp_payroll
            SET payment_status = 'PAID',
                payment_mode = ?,
                payment_reference = ?,
                payment_date = CURRENT_TIMESTAMP,
                payment_processed_by = ?,
                processed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE payroll_id = ?
        `;
        
        const [result] = await db.execute(query, [
            payment_mode,
            payment_reference,
            payment_processed_by,
            payroll_id
        ]);
        
        return result;
    } catch (error) {
        console.error('Mark payroll as paid error:', error);
        throw error;
    }
};

/**
 * Get pending payrolls
 */
const getPendingPayrolls = async (customer_id = null) => {
    try {
        let query = `
            SELECT 
                p.*,
                ai_sp.full_name as provider_name,
                ai_c.full_name as customer_name
            FROM sp_payroll p
            JOIN account_information ai_sp ON p.service_provider_id = ai_sp.registration_id
            JOIN account_information ai_c ON p.customer_id = ai_c.registration_id
            WHERE p.payment_status IN ('PENDING', 'PROCESSING')
        `;
        
        const params = [];
        
        if (customer_id) {
            query += ' AND p.customer_id = ?';
            params.push(customer_id);
        }
        
        query += ' ORDER BY p.generated_at ASC';
        
        const [rows] = await db.execute(query, params);
        return rows;
    } catch (error) {
        console.error('Get pending payrolls error:', error);
        throw error;
    }
};

// ==========================================
// ATTENDANCE HISTORY QUERIES
// ==========================================

/**
 * Log attendance history
 */
const logAttendanceHistory = async (attendance_id, field_changed, old_value, new_value, change_reason, changed_by) => {
    try {
        const query = `
            INSERT INTO sp_attendance_history (
                attendance_id, field_changed, old_value, new_value,
                change_reason, changed_by
            ) VALUES (?, ?, ?, ?, ?, ?)
        `;
        
        const [result] = await db.execute(query, [
            attendance_id, field_changed, old_value, new_value,
            change_reason, changed_by
        ]);
        
        return result;
    } catch (error) {
        console.error('Log attendance history error:', error);
        throw error;
    }
};

/**
 * Get attendance history
 */
const getAttendanceHistory = async (attendance_id) => {
    try {
        const query = `
            SELECT 
                ah.*,
                ai.full_name as changed_by_name
            FROM sp_attendance_history ah
            JOIN account_information ai ON ah.changed_by = ai.registration_id
            WHERE ah.attendance_id = ?
            ORDER BY ah.changed_at DESC
        `;
        
        const [rows] = await db.execute(query, [attendance_id]);
        return rows;
    } catch (error) {
        console.error('Get attendance history error:', error);
        throw error;
    }
};

// Export all functions
module.exports = {
    // Salary Config
    upsertSalaryConfig,
    getSalaryConfigByBooking,
    getActiveSalaryConfig,
    
    // Attendance
    punchIn,
    punchOut,
    manualAttendanceEntry,
    markDelay,
    getAttendanceByDate,
    getMonthlyAttendance,
    getMonthlyAttendanceStats,
    getCustomerServiceProvidersAttendance,
    
    // Leave
    applyLeave,
    updateLeaveStatus,
    markLeaveDaysInAttendance,
    getLeaveHistory,
    getPendingLeaves,
    
    // Payroll
    generatePayroll,
    getPayrollById,
    getPayrollByMonth,
    getAllPayrolls,
    getPayrollsByCustomer,
    updatePayrollPaymentStatus,
    markPayrollAsPaid,
    getPendingPayrolls,
    
    // History
    logAttendanceHistory,
    getAttendanceHistory
};