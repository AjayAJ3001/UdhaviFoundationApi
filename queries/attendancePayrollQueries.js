// queries/attendancePayrollQueries.js
//const db = require('../database/connection');
const db = require('../database/connection');

//const db = require('../config/database');
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
                DATE_ADD(l.from_date, INTERVAL n DAY) as attendance_date,
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
            AND DATE_ADD(l.from_date, INTERVAL n DAY) <= l.to_date
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

/**
 * Get all leaves with filters for Manage Leave Screen
 */
async function getAllLeavesWithFilters(filters) {
    let query = `
        SELECT 
            l.leave_id,
            l.service_provider_id,
            l.customer_id,
            
            -- Customer/Service Provider Info
            COALESCE(cust.full_name, 'Unknown') AS customer_name,
            COALESCE(sp.full_name, 'Unknown') AS employee_name,
            
            -- Leave Details
            l.leave_type,
            DATE_FORMAT(l.from_date, '%d/%m/%Y') AS start_date,
            DATE_FORMAT(l.to_date, '%d/%m/%Y') AS end_date,
            DATE_FORMAT(l.applied_date, '%d/%m/%Y') AS applied_on,
            l.total_days,
            l.reason,
          l.is_paid_leave AS is_paid,  
            
            -- Status
            l.status,
            
            -- Approval Info
            l.approved_by,
            COALESCE(approver.full_name, NULL) AS approved_by_name,
            DATE_FORMAT(l.approved_date, '%d/%m/%Y %h:%i %p') AS approved_date,
            l.rejection_reason
            
        FROM sp_leave l
        LEFT JOIN account_information cust ON l.customer_id = cust.registration_id
        LEFT JOIN account_information sp ON l.service_provider_id = sp.registration_id
        LEFT JOIN account_information approver ON l.approved_by = approver.registration_id
        WHERE 1=1
    `;

    const params = [];

    if (filters.status) {
        query += ` AND l.status = ?`;
        params.push(filters.status);
    }

    if (filters.customer_id) {
        query += ` AND l.customer_id = ?`;
        params.push(filters.customer_id);
    }

    if (filters.search) {
        query += ` AND (cust.full_name LIKE ? OR sp.full_name LIKE ?)`;
        params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    query += ` ORDER BY l.applied_date DESC`;

    const [rows] = await db.execute(query, params);
    return rows;
}

/**
 * Get leaves summary statistics
 */
async function getLeavesSummary() {
    const [rows] = await db.execute(`
        SELECT 
            COUNT(*) AS total,
            SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending,
            SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) AS approved,
            SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) AS rejected,
            SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled
        FROM sp_leave
    `);
    
    return rows[0];
}

/**
 * Get all attendances with filters for Manage Attendance Screen
 */
async function getAllAttendancesWithFilters(filters) {
    let query = `
        SELECT 
            CONCAT('A', LPAD(a.attendance_id, 4, '0')) AS id,
            
            -- Service Provider Info
            a.service_provider_id,
            CONCAT('P-', LPAD(a.service_provider_id, 3, '0')) AS service_provider_code,
            COALESCE(sp.full_name, 'Unknown') AS service_provider_name,
            
            -- Customer Info
            a.customer_id,
            COALESCE(cust.full_name, 'Unknown') AS customer_name,
            
            -- Date & Time
            DATE_FORMAT(a.attendance_date, '%d/%m/%Y') AS date,
            DATE_FORMAT(a.check_in_time, '%h:%i %p') AS check_in,
            DATE_FORMAT(a.check_out_time, '%h:%i %p') AS check_out,
            
            -- Hours
            COALESCE(a.total_hours, 0) AS total_hours,
            CONCAT(COALESCE(a.total_hours, 0), ' Hours') AS total_hours_display,
            
            -- Planned hours (standard 8 hours)
            8 AS planned_hrs,
            '8 hrs' AS planned_hrs_display,
            
            -- Status
            a.status,
            
            -- Additional Info
            a.delay_minutes,
            a.notes,
            a.is_manual_entry,
            
            -- Verified By
            COALESCE(verifier.full_name, '-') AS verified_by
            
        FROM sp_attendance a
        LEFT JOIN account_information sp ON a.service_provider_id = sp.registration_id
        LEFT JOIN account_information cust ON a.customer_id = cust.registration_id
        LEFT JOIN account_information verifier ON a.created_by = verifier.registration_id
        WHERE 1=1
    `;

    const params = [];

    if (filters.status) {
        query += ` AND a.status = ?`;
        params.push(filters.status);
    }

    if (filters.customer_id) {
        query += ` AND a.customer_id = ?`;
        params.push(filters.customer_id);
    }

    if (filters.date) {
        query += ` AND a.attendance_date = ?`;
        params.push(filters.date);
    }

    if (filters.month && filters.year) {
        query += ` AND MONTH(a.attendance_date) = ? AND YEAR(a.attendance_date) = ?`;
        params.push(filters.month, filters.year);
    }

    if (filters.search) {
        query += ` AND (sp.full_name LIKE ? OR cust.full_name LIKE ?)`;
        params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    query += ` ORDER BY a.attendance_date DESC, a.service_provider_id`;

    const [rows] = await db.execute(query, params);
    return rows;
}

/**
 * Get attendances summary statistics
 */
async function getAttendancesSummary(month = null, year = null) {
    let query = `
        SELECT 
            COUNT(*) AS total,
            SUM(CASE WHEN status = 'PRESENT' THEN 1 ELSE 0 END) AS present,
            SUM(CASE WHEN status = 'ABSENT' THEN 1 ELSE 0 END) AS absent,
            SUM(CASE WHEN status = 'LATE' THEN 1 ELSE 0 END) AS late,
            SUM(CASE WHEN status = 'LEAVE' THEN 1 ELSE 0 END) AS leave_count,
            SUM(CASE WHEN status = 'HALF_DAY' THEN 1 ELSE 0 END) AS half_day
        FROM sp_attendance
    `;

    const params = [];

    if (month && year) {
        query += ` WHERE MONTH(attendance_date) = ? AND YEAR(attendance_date) = ?`;
        params.push(month, year);
    }

    const [rows] = await db.execute(query, params);
    return rows[0];
}

/**
 * Get all payrolls - VERIFIED VERSION
 */
async function getAllPayrollsWithFilters(filters) {
    let query = `
        SELECT 
            p.payroll_id,
            CONCAT('PR-', p.year, '-', LPAD(p.month, 2, '0'), '-', LPAD(p.payroll_id, 4, '0')) AS payroll_id_display,
            
            p.service_provider_id,
            CONCAT('EMP-', LPAD(p.service_provider_id, 3, '0')) AS employee_code,
            COALESCE(sp.full_name, 'Unknown Employee') AS employee_name,
            
            CONCAT(p.year, '-', LPAD(p.month, 2, '0')) AS period,
            p.month AS period_month,
            p.year AS period_year,
            
            p.total_working_days AS working_days,
            p.present_days,
            p.absent_days,
            p.leave_days,
            p.late_days,
            p.half_days,
            
            CONCAT(p.present_days * 8, ' hrs') AS total_hrs,
            
            p.base_salary,
            p.earned_salary,
            p.pf_deduction,
            p.other_deductions,
            (p.pf_deduction + p.other_deductions) AS total_deductions,
            p.bonuses,
            p.allowances,
            p.net_payable,
            
            CONCAT('Rs. ', FORMAT(p.base_salary, 0)) AS total_display,
            CONCAT('Rs. ', FORMAT((p.pf_deduction + p.other_deductions), 0)) AS deduction_display,
            CONCAT('Rs. ', FORMAT(p.net_payable, 0)) AS net_display,
            
            p.base_salary AS total,
            (p.pf_deduction + p.other_deductions) AS deduction,
            p.net_payable AS net,
            
            p.payment_status,
            CASE 
                WHEN p.payment_status = 'PENDING' THEN 'PENDING'
                WHEN p.payment_status = 'PAID' THEN 'PAID'
                WHEN p.payment_status = 'APPROVED' THEN 'ON-HOLD'
                WHEN p.payment_status = 'CANCELLED' THEN 'CANCELLED'
                ELSE p.payment_status
            END AS status,
            
            p.payment_method AS payment_mode,
            p.payment_reference,
            DATE_FORMAT(p.payment_date, '%d/%m/%Y') AS payment_date,
            COALESCE(proc.full_name, NULL) AS processed_by,
            
            DATE_FORMAT(p.generated_at, '%d/%m/%Y %h:%i %p') AS generated_at
            
        FROM sp_payroll p
        LEFT JOIN account_information sp ON p.service_provider_id = sp.registration_id
        LEFT JOIN account_information proc ON p.paid_by = proc.registration_id
        WHERE 1=1
    `;

    const params = [];

    // Add filters
    if (filters.status) {
        if (filters.status === 'PENDING') {
            query += ` AND p.payment_status = 'PENDING'`;
        } else if (filters.status === 'PAID') {
            query += ` AND p.payment_status = 'PAID'`;
        } else if (filters.status === 'ON-HOLD') {
            query += ` AND p.payment_status = 'APPROVED'`;
        } else if (filters.status === 'CANCELLED') {
            query += ` AND p.payment_status = 'CANCELLED'`;
        }
    }

    if (filters.month) {
        query += ` AND p.month = ?`;
        params.push(parseInt(filters.month));
    }

    if (filters.year) {
        query += ` AND p.year = ?`;
        params.push(parseInt(filters.year));
    }

    if (filters.customer_id) {
        query += ` AND p.customer_id = ?`;
        params.push(parseInt(filters.customer_id));
    }

    if (filters.search) {
        query += ` AND (sp.full_name LIKE ? OR CONCAT('PR-', p.year, '-', LPAD(p.month, 2, '0'), '-', LPAD(p.payroll_id, 4, '0')) LIKE ?)`;
        params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    query += ` ORDER BY p.year DESC, p.month DESC, p.payroll_id DESC`;

    console.log('🔍 Executing query with params:', params);
    
    const [rows] = await db.execute(query, params);
    
    console.log(`✅ Found ${rows.length} payroll records`);
    
    return rows;
}


/**
 * Get payroll details by ID
 */
async function getPayrollDetailsById(payroll_id) {
    const [rows] = await db.execute(`
        SELECT 
            p.payroll_id,
            CONCAT('PR-', p.year, '-', LPAD(p.month, 2, '0'), '-', LPAD(p.payroll_id, 4, '0')) AS payroll_reference,
            
            p.service_provider_id,
            COALESCE(sp.full_name, 'Unknown') AS employee_name,
            COALESCE(sp.email_address, NULL) AS employee_email,
            COALESCE(sp.mobile_number, NULL) AS employee_phone,
            
            p.customer_id,
            COALESCE(cust.full_name, 'Unknown') AS customer_name,
            
            CONCAT(p.year, '-', LPAD(p.month, 2, '0')) AS period,
            p.month AS period_month,
            p.year AS period_year,
            
            p.total_working_days AS working_days,
            p.present_days,
            p.absent_days,
            p.leave_days,
            p.late_days,
            p.half_days,
            
            p.base_salary AS gross_salary,
            p.earned_salary AS per_day_salary,
            p.earned_salary,
            p.pf_deduction,
            p.other_deductions,
            (p.pf_deduction + p.other_deductions) AS total_deductions,
            p.bonuses,
            p.allowances,
            p.net_payable AS net_salary,
            
            p.payment_status,
            p.payment_method AS payment_mode,
            p.payment_reference,
            DATE_FORMAT(p.payment_date, '%d-%m-%Y') AS payment_date_formatted,
            
            DATE_FORMAT(p.generated_at, '%d/%m/%Y %h:%i %p') AS generated_at
            
        FROM sp_payroll p
        LEFT JOIN account_information sp ON p.service_provider_id = sp.registration_id
        LEFT JOIN account_information cust ON p.customer_id = cust.registration_id
        WHERE p.payroll_id = ?
    `, [payroll_id]);

    return rows[0] || null;
}

/**
 * Get payrolls summary
 */
async function getPayrollsSummary(month = null, year = null) {
    let query = `
        SELECT 
            COUNT(*) AS total,
            SUM(CASE WHEN payment_status = 'PENDING' THEN 1 ELSE 0 END) AS pending_count,
            SUM(CASE WHEN payment_status = 'PAID' THEN 1 ELSE 0 END) AS paid_count,
            SUM(CASE WHEN payment_status = 'APPROVED' THEN 1 ELSE 0 END) AS on_hold_count,
            SUM(CASE WHEN payment_status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled_count,
            COALESCE(SUM(CASE WHEN payment_status = 'PENDING' THEN net_payable ELSE 0 END), 0) AS pending_amount,
            COALESCE(SUM(CASE WHEN payment_status = 'PAID' THEN net_payable ELSE 0 END), 0) AS paid_amount,
            COALESCE(SUM(net_payable), 0) AS total_amount
        FROM sp_payroll
        WHERE 1=1
    `;

    const params = [];

    if (month && year) {
        query += ` AND month = ? AND year = ?`;
        params.push(parseInt(month), parseInt(year));
    }

    const [rows] = await db.execute(query, params);
    
    const summary = rows[0];
    return {
        total: summary.total || 0,
        pending_count: summary.pending_count || 0,
        paid_count: summary.paid_count || 0,
        on_hold_count: summary.on_hold_count || 0,
        cancelled_count: summary.cancelled_count || 0,
        pending_amount: summary.pending_amount || 0,
        paid_amount: summary.paid_amount || 0,
        total_amount: summary.total_amount || 0,
        pending_amount_display: `Rs. ${(summary.pending_amount || 0).toLocaleString('en-IN')}`,
        paid_amount_display: `Rs. ${(summary.paid_amount || 0).toLocaleString('en-IN')}`,
        total_amount_display: `Rs. ${(summary.total_amount || 0).toLocaleString('en-IN')}`
    };
}

/**
 * Get approved leaves for month
 */
async function getApprovedLeavesForMonth(service_provider_id, month, year) {
    const [rows] = await db.execute(`
        SELECT 
            leave_type,
            DATE_FORMAT(start_date, '%d/%m/%Y') AS start_date_formatted,
            DATE_FORMAT(end_date, '%d/%m/%Y') AS end_date_formatted,
            total_days,
            reason
        FROM sp_leave
        WHERE service_provider_id = ?
            AND status = 'APPROVED'
            AND MONTH(start_date) = ?
            AND YEAR(start_date) = ?
    `, [service_provider_id, month, year]);

    return rows;
}

/**
 * Export payrolls
 */
async function getExportPayrolls(month = null, year = null) {
    let query = `
        SELECT 
            CONCAT('PR-', p.year, '-', LPAD(p.month, 2, '0'), '-', LPAD(p.payroll_id, 4, '0')) AS Payroll_ID,
            CONCAT('EMP-', LPAD(p.service_provider_id, 3, '0')) AS Employee_Code,
            COALESCE(sp.full_name, 'Unknown') AS Employee_Name,
            CONCAT(p.year, '-', LPAD(p.month, 2, '0')) AS Period,
            p.total_working_days AS Working_Days,
            p.present_days AS Present_Days,
            p.absent_days AS Absent_Days,
            p.leave_days AS Leave_Days,
            p.late_days AS Late_Days,
            p.half_days AS Half_Days,
            p.base_salary AS Base_Salary,
            p.earned_salary AS Earned_Salary,
            p.pf_deduction AS PF_Deduction,
            p.other_deductions AS Other_Deductions,
            (p.pf_deduction + p.other_deductions) AS Total_Deductions,
            p.bonuses AS Bonuses,
            p.allowances AS Allowances,
            p.net_payable AS Net_Salary,
            p.payment_status AS Status,
            p.payment_method AS Payment_Mode,
            DATE_FORMAT(p.payment_date, '%d/%m/%Y') AS Payment_Date,
            p.payment_reference AS Payment_Reference
        FROM sp_payroll p
        LEFT JOIN account_information sp ON p.service_provider_id = sp.registration_id
        WHERE 1=1
    `;

    const params = [];

    if (month && year) {
        query += ` AND p.month = ? AND p.year = ?`;
        params.push(parseInt(month), parseInt(year));
    }

    query += ` ORDER BY p.year DESC, p.month DESC`;

    const [rows] = await db.execute(query, params);
    return rows;
}

// ==========================================
// EXPORT QUERIES
// ==========================================

/**
 * Get all leaves data for export
 */
async function getExportLeaves() {
    const [rows] = await db.execute(`
        SELECT 
            CONCAT('L-', LPAD(l.leave_id, 4, '0')) AS Leave_ID,
            COALESCE(cust.full_name, 'Unknown') AS Customer_Name,
            COALESCE(sp.full_name, 'Unknown') AS Employee_Name,
            DATE_FORMAT(l.applied_date, '%d/%m/%Y') AS Applied_On,
            DATE_FORMAT(l.from_date, '%d/%m/%Y') AS Start_Date,
            DATE_FORMAT(l.to_date, '%d/%m/%Y') AS End_Date,
            l.total_days AS Total_Days,
            l.leave_type AS Leave_Type,
            l.reason AS Reason,
            l.status AS Status,
            CASE WHEN l.is_paid THEN 'Yes' ELSE 'No' END AS Is_Paid
        FROM sp_leave l
        LEFT JOIN account_information cust ON l.customer_id = cust.registration_id
        LEFT JOIN account_information sp ON l.service_provider_id = sp.registration_id
        ORDER BY l.applied_date DESC
    `);

    return rows;
}

/**
 * Get all attendances data for export
 */
async function getExportAttendances(month = null, year = null) {
    let query = `
        SELECT 
            CONCAT('A', LPAD(a.attendance_id, 4, '0')) AS ID,
            CONCAT('P-', LPAD(a.service_provider_id, 3, '0')) AS Service_Provider_ID,
            COALESCE(sp.full_name, 'Unknown') AS Service_Provider_Name,
            DATE_FORMAT(a.attendance_date, '%d/%m/%Y') AS Date,
            DATE_FORMAT(a.check_in_time, '%h:%i %p') AS Check_In,
            DATE_FORMAT(a.check_out_time, '%h:%i %p') AS Check_Out,
            COALESCE(a.total_hours, 0) AS Total_Hours,
            a.status AS Status,
            COALESCE(cust.full_name, 'Unknown') AS Customer_Name
        FROM sp_attendance a
        LEFT JOIN account_information sp ON a.service_provider_id = sp.registration_id
        LEFT JOIN account_information cust ON a.customer_id = cust.registration_id
        WHERE 1=1
    `;

    const params = [];

    if (month && year) {
        query += ` AND MONTH(a.attendance_date) = ? AND YEAR(a.attendance_date) = ?`;
        params.push(month, year);
    }

    query += ` ORDER BY a.attendance_date DESC`;

    const [rows] = await db.execute(query, params);
    return rows;
}

/**
 * Get all payrolls data for export
 */
// async function getExportPayrolls(month = null, year = null) {
//     let query = `
//         SELECT 
//             p.payroll_reference AS Payroll_ID,
//             CONCAT('P-', LPAD(p.service_provider_id, 3, '0')) AS Employee_Code,
//             COALESCE(sp.full_name, 'Unknown') AS Employee_Name,
//             CONCAT(p.period_year, '-', LPAD(p.period_month, 2, '0')) AS Period,
//             p.total_working_days AS Working_Days,
//             p.present_days AS Present_Days,
//             p.absent_days AS Absent_Days,
//             p.leave_days AS Leave_Days,
//             p.gross_salary AS Gross_Salary,
//             p.total_deductions AS Deductions,
//             p.net_salary AS Net_Salary,
//             p.payment_status AS Status,
//             p.payment_mode AS Payment_Mode,
//             DATE_FORMAT(p.payment_date, '%d/%m/%Y') AS Payment_Date
//         FROM sp_payroll p
//         LEFT JOIN account_information sp ON p.service_provider_id = sp.registration_id
//         WHERE 1=1
//     `;

//     const params = [];

//     if (month && year) {
//         query += ` AND p.period_month = ? AND p.period_year = ?`;
//         params.push(month, year);
//     }

//     query += ` ORDER BY p.period_year DESC, p.period_month DESC`;

//     const [rows] = await db.execute(query, params);
//     return rows;
// }

/**
 * Get ALL payroll records with complete details
 */
async function getAllPayrollData() {
    const query = `
        SELECT 
            p.payroll_id,
            p.payroll_reference,
            
            -- Employee/Service Provider Info
            p.service_provider_id,
            COALESCE(sp.full_name, 'Unknown') AS employee_name,
            COALESCE(sp.email, NULL) AS employee_email,
            COALESCE(sp.phone_number, NULL) AS employee_phone,
            
            -- Customer Info
            p.customer_id,
            COALESCE(cust.full_name, 'Unknown') AS customer_name,
            COALESCE(cust.email, NULL) AS customer_email,
            
            -- Booking Info
            p.booking_id,
            
            -- Period Details
            p.period_month,
            p.period_year,
            CONCAT(p.period_year, '-', LPAD(p.period_month, 2, '0')) AS period,
            DATE_FORMAT(p.period_start_date, '%d/%m/%Y') AS period_start_date,
            DATE_FORMAT(p.period_end_date, '%d/%m/%Y') AS period_end_date,
            
            -- Working Days Details
            p.total_working_days,
            p.present_days,
            p.absent_days,
            p.leave_days,
            p.late_days,
            p.half_days,
            
            -- Salary Details
            p.gross_salary,
            CONCAT('₹ ', FORMAT(p.gross_salary, 2)) AS gross_salary_display,
            p.per_day_salary,
            CONCAT('₹ ', FORMAT(p.per_day_salary, 2)) AS per_day_salary_display,
            p.earned_salary,
            CONCAT('₹ ', FORMAT(p.earned_salary, 2)) AS earned_salary_display,
            
            -- Deductions
            p.pf_deduction,
            CONCAT('₹ ', FORMAT(p.pf_deduction, 2)) AS pf_deduction_display,
            p.pf_percentage,
            p.other_deductions,
            CONCAT('₹ ', FORMAT(p.other_deductions, 2)) AS other_deductions_display,
            p.total_deductions,
            CONCAT('₹ ', FORMAT(p.total_deductions, 2)) AS total_deductions_display,
            
            -- Net Salary
            p.net_salary,
            CONCAT('₹ ', FORMAT(p.net_salary, 2)) AS net_salary_display,
            
            -- Payment Info
            p.payment_status,
            CASE 
                WHEN p.payment_status = 'PAID' THEN 'Paid'
                WHEN p.payment_status = 'PENDING' THEN 'Pending'
                WHEN p.payment_status = 'PROCESSING' THEN 'Processing'
                WHEN p.payment_status = 'CANCELLED' THEN 'Cancelled'
                ELSE 'Unknown'
            END AS payment_status_display,
            p.payment_mode,
            p.payment_reference,
            DATE_FORMAT(p.payment_date, '%d/%m/%Y') AS payment_date,
            
            -- Timestamps
            DATE_FORMAT(p.generated_at, '%d/%m/%Y %h:%i %p') AS generated_at,
            DATE_FORMAT(p.created_at, '%d/%m/%Y %h:%i %p') AS created_at,
            COALESCE(creator.full_name, 'System') AS created_by_name
            
        FROM sp_payroll p
        LEFT JOIN account_information sp ON p.service_provider_id = sp.registration_id
        LEFT JOIN account_information cust ON p.customer_id = cust.registration_id
        LEFT JOIN account_information creator ON p.created_by = creator.registration_id
        ORDER BY p.period_year DESC, p.period_month DESC, p.payroll_id DESC
    `;

    const [rows] = await db.query(query);
    return rows;
}

/**
 * Get ALL payroll records with complete details
 * Returns every record from sp_payroll table with joins
 */
async function getAllPayrollData() {
    const query = `
        SELECT 
            -- Payroll IDs
            p.payroll_id,
            CONCAT('PR-', p.year, '-', LPAD(p.month, 2, '0'), '-', LPAD(p.payroll_id, 4, '0')) AS payroll_reference,
            
            -- IDs for joining
            p.service_provider_id,
            p.customer_id,
            p.booking_id,
            
            -- Employee & Customer Names (safe - full_name exists in all tables)
            COALESCE(sp.full_name, 'Unknown') AS employee_name,
            COALESCE(cust.full_name, 'Unknown') AS customer_name,
            
            -- Period Info
            p.month AS period_month,
            p.year AS period_year,
            CONCAT(p.year, '-', LPAD(p.month, 2, '0')) AS period,
            
            -- Working Days Breakdown
            p.total_working_days,
            p.present_days,
            p.absent_days,
            p.leave_days,
            COALESCE(p.late_days, 0) AS late_days,
            COALESCE(p.half_days, 0) AS half_days,
            
            -- Salary Details (Raw Numbers)
            p.base_salary AS gross_salary,
            p.earned_salary,
            
            -- Formatted Display
            CONCAT('₹ ', FORMAT(p.base_salary, 2)) AS gross_salary_display,
            CONCAT('₹ ', FORMAT(p.earned_salary, 2)) AS earned_salary_display,
            
            -- Deductions
            COALESCE(p.pf_deduction, 0) AS pf_deduction,
            COALESCE(p.other_deductions, 0) AS other_deductions,
            (COALESCE(p.pf_deduction, 0) + COALESCE(p.other_deductions, 0)) AS total_deductions,
            
            -- Formatted Deductions
            CONCAT('₹ ', FORMAT(COALESCE(p.pf_deduction, 0), 2)) AS pf_deduction_display,
            CONCAT('₹ ', FORMAT(COALESCE(p.other_deductions, 0), 2)) AS other_deductions_display,
            CONCAT('₹ ', FORMAT((COALESCE(p.pf_deduction, 0) + COALESCE(p.other_deductions, 0)), 2)) AS total_deductions_display,
            
            -- Net Salary (Final Amount)
            p.net_payable AS net_salary,
            CONCAT('₹ ', FORMAT(p.net_payable, 2)) AS net_salary_display,
            
            -- Payment Status
            p.payment_status,
            CASE 
                WHEN p.payment_status = 'PAID' THEN 'Paid'
                WHEN p.payment_status = 'PENDING' THEN 'Pending'
                WHEN p.payment_status = 'PROCESSING' THEN 'Processing'
                WHEN p.payment_status = 'APPROVED' THEN 'On-Hold'
                WHEN p.payment_status = 'CANCELLED' THEN 'Cancelled'
                ELSE 'Unknown'
            END AS payment_status_display,
            
            -- Payment Information
            p.payment_method AS payment_mode,
            p.payment_reference,
            DATE_FORMAT(p.payment_date, '%d/%m/%Y') AS payment_date,
            
            -- Timestamps
            DATE_FORMAT(p.generated_at, '%d/%m/%Y %h:%i %p') AS generated_at,
            DATE_FORMAT(p.created_at, '%d/%m/%Y %h:%i %p') AS created_at
            
        FROM sp_payroll p
        LEFT JOIN account_information sp ON p.service_provider_id = sp.registration_id
        LEFT JOIN account_information cust ON p.customer_id = cust.registration_id
        ORDER BY p.year DESC, p.month DESC, p.payroll_id DESC
    `;

    const [rows] = await db.query(query);
    return rows;
}


// Export all functions
module.exports = {

    getAllPayrollData,
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
    getAttendanceHistory,

       // Screen-specific queries
    getAllLeavesWithFilters,
    getLeavesSummary,
    getAllAttendancesWithFilters,
    getAttendancesSummary,
    getAllPayrollsWithFilters,
    getPayrollsSummary,
    getPayrollDetailsById,
    getApprovedLeavesForMonth,
    
    // Export queries
    getExportLeaves,
    getExportAttendances,
    getExportPayrolls
};