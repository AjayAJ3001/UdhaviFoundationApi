// queries/attendancePayrollQueries.js - FIXED FOR YOUR DATABASE STRUCTURE
const db = require('../database/connection');

// ==========================================
// SERVICE PROVIDER ASSIGNMENT QUERIES
// ==========================================

/**
 * Get assigned service providers by customer ID
 * FIXED: Uses actual table names and columns from your database
 */
const getAssignedProvidersByCustomerId = async (customer_id) => {
    try {
        const query = `
            SELECT 
                sb.id as internal_id,
                sb.booking_id,
                sb.assigned_provider_id as service_provider_id,
                sb.customer_id,
                sb.service_id,
                sb.booking_status,
                
                -- Service Provider Info
                ai_sp.full_name as provider_name,
                ai_sp.email_address as provider_email,
                ai_sp.mobile_number as provider_phone,
                
                -- Service Info from service_types table
                st.name as service_name,
                st.service_code,
                st.category,
                
                -- Salary Info
                sc.monthly_salary,
                sc.per_day_salary,
                sc.working_days_per_month,
                
                -- Dates
                DATE_FORMAT(sb.created_at, '%d/%m/%Y') as assignment_date,
                DATE_FORMAT(sb.service_start_date, '%d/%m/%Y') as service_start_date,
                
                -- Latest attendance status
                (SELECT status FROM sp_attendance 
                 WHERE service_provider_id = sb.assigned_provider_id 
                 AND customer_id = sb.customer_id
                 ORDER BY attendance_date DESC LIMIT 1) as last_attendance_status,
                (SELECT DATE_FORMAT(attendance_date, '%d/%m/%Y') FROM sp_attendance 
                 WHERE service_provider_id = sb.assigned_provider_id 
                 AND customer_id = sb.customer_id
                 ORDER BY attendance_date DESC LIMIT 1) as last_attendance_date,
                 
                -- Today's attendance status
                (SELECT status FROM sp_attendance 
                 WHERE service_provider_id = sb.assigned_provider_id 
                 AND customer_id = sb.customer_id
                 AND attendance_date = CURDATE()) as today_status,
                (SELECT check_in_time FROM sp_attendance 
                 WHERE service_provider_id = sb.assigned_provider_id 
                 AND customer_id = sb.customer_id
                 AND attendance_date = CURDATE()) as today_check_in,
                (SELECT check_out_time FROM sp_attendance 
                 WHERE service_provider_id = sb.assigned_provider_id 
                 AND customer_id = sb.customer_id
                 AND attendance_date = CURDATE()) as today_check_out
                 
            FROM service_bookings sb
            JOIN account_information ai_sp ON sb.assigned_provider_id = ai_sp.registration_id
            LEFT JOIN service_types st ON sb.service_id = st.service_id
            LEFT JOIN sp_salary_config sc ON sb.booking_id = sc.booking_id AND sc.is_active = TRUE
            WHERE sb.customer_id = ?
            AND sb.assigned_provider_id IS NOT NULL
            AND sb.booking_status IN ('assigned', 'confirmed', 'active')
            ORDER BY sb.created_at DESC
        `;
        
        const [rows] = await db.execute(query, [customer_id]);
        return rows;
    } catch (error) {
        console.error('Get assigned providers by customer ID error:', error);
        throw error;
    }
};

/**
 * Get assigned service providers by booking ID
 */
const getAssignedProvidersByBookingId = async (booking_id) => {
    try {
        const query = `
            SELECT 
                sb.id as internal_id,
                sb.booking_id,
                sb.assigned_provider_id as service_provider_id,
                sb.customer_id,
                sb.service_id,
                sb.booking_status,
                
                -- Service Provider Info
                ai_sp.full_name as provider_name,
                ai_sp.email_address as provider_email,
                ai_sp.mobile_number as provider_phone,
                
                -- Customer Info
                ai_c.full_name as customer_name,
                ai_c.email_address as customer_email,
                ai_c.mobile_number as customer_phone,
                
                -- Service Info
                st.name as service_name,
                st.category,
                
                -- Salary Info
                sc.monthly_salary,
                sc.per_day_salary,
                sc.working_days_per_month,
                
                -- Dates
                DATE_FORMAT(sb.created_at, '%d/%m/%Y') as assignment_date,
                DATE_FORMAT(sb.service_start_date, '%d/%m/%Y') as service_start_date
                
            FROM service_bookings sb
            JOIN account_information ai_sp ON sb.assigned_provider_id = ai_sp.registration_id
            JOIN account_information ai_c ON sb.customer_id = ai_c.registration_id
            LEFT JOIN service_types st ON sb.service_id = st.service_id
            LEFT JOIN sp_salary_config sc ON sb.booking_id = sc.booking_id AND sc.is_active = TRUE
            WHERE sb.booking_id = ?
            AND sb.assigned_provider_id IS NOT NULL
            AND sb.booking_status IN ('assigned', 'confirmed', 'active')
        `;
        
        const [rows] = await db.execute(query, [booking_id]);
        return rows;
    } catch (error) {
        console.error('Get assigned providers by booking ID error:', error);
        throw error;
    }
};

/**
 * Verify if service provider is assigned to booking
 */
const verifyProviderAssignment = async (service_provider_id, booking_id, customer_id) => {
    try {
        const query = `
            SELECT 
                id as internal_id,
                booking_id,
                assigned_provider_id as service_provider_id,
                customer_id,
                booking_status,
                service_id
            FROM service_bookings
            WHERE assigned_provider_id = ?
            AND booking_id = ?
            AND customer_id = ?
            AND booking_status IN ('assigned', 'confirmed', 'active')
            LIMIT 1
        `;
        
        const [rows] = await db.execute(query, [service_provider_id, booking_id, customer_id]);
        return rows.length > 0 ? rows[0] : null;
    } catch (error) {
        console.error('Verify provider assignment error:', error);
        throw error;
    }
};

// ==========================================
// SALARY CONFIGURATION
// ==========================================

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

const getSalaryConfigByBooking = async (booking_id) => {
    try {
        const query = `
            SELECT 
                sc.*,
                ai_sp.full_name as provider_name,
                ai_sp.email_address as provider_email,
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
        // Verify provider is assigned
        const assignment = await verifyProviderAssignment(service_provider_id, booking_id, customer_id);
        
        if (!assignment) {
            throw new Error('Service provider is not assigned to this booking or customer');
        }

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

const punchOut = async (attendanceData) => {
    const {
        service_provider_id,
        customer_id,
        booking_id,
        attendance_date,
        check_out_time,
        check_out_latitude,
        check_out_longitude
    } = attendanceData;

    try {
        // Verify provider is assigned
        const assignment = await verifyProviderAssignment(service_provider_id, booking_id, customer_id);
        
        if (!assignment) {
            throw new Error('Service provider is not assigned to this booking or customer');
        }

        // Check if check-in exists
        const checkQuery = `
            SELECT attendance_id, check_in_time 
            FROM sp_attendance 
            WHERE service_provider_id = ? 
            AND customer_id = ?
            AND booking_id = ?
            AND attendance_date = ?
        `;
        const [checkRows] = await db.execute(checkQuery, [
            service_provider_id, customer_id, booking_id, attendance_date
        ]);
        
        if (checkRows.length === 0) {
            throw new Error('No check-in record found for this date. Please punch in first.');
        }

        // Calculate total hours
        const query = `
            UPDATE sp_attendance
            SET check_out_time = ?,
                check_out_latitude = ?,
                check_out_longitude = ?,
                total_hours = TIMESTAMPDIFF(MINUTE, check_in_time, ?) / 60,
                updated_at = CURRENT_TIMESTAMP
            WHERE service_provider_id = ? 
            AND customer_id = ?
            AND booking_id = ?
            AND attendance_date = ?
        `;
        
        const [result] = await db.execute(query, [
            check_out_time, check_out_latitude, check_out_longitude,
            check_out_time, service_provider_id, customer_id, booking_id, attendance_date
        ]);
        
        return result;
    } catch (error) {
        console.error('Punch out error:', error);
        throw error;
    }
};

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
        
        return result;
    } catch (error) {
        console.error('Manual attendance entry error:', error);
        throw error;
    }
};

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

const getMonthlyAttendance = async (service_provider_id, month, year) => {
    try {
        const query = `
            SELECT 
                a.*,
                ai_c.full_name as customer_name,
                DATE_FORMAT(a.attendance_date, '%d/%m/%Y') as date_formatted,
                DATE_FORMAT(a.check_in_time, '%h:%i %p') as check_in_formatted,
                DATE_FORMAT(a.check_out_time, '%h:%i %p') as check_out_formatted
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

// Export minimal required functions for now
module.exports = {
    // Service Provider Assignment
    getAssignedProvidersByCustomerId,
    getAssignedProvidersByBookingId,
    verifyProviderAssignment,
    
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
    getCustomerServiceProvidersAttendance
};