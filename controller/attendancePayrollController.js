// controller/attendancePayrollController.js
const attendancePayrollQueries = require('../queries/attendancePayrollQueries');
const { validationResult } = require('express-validator');
// Load Attendance & Payroll Controller
//const attendancePayrollController = loadModule('./controller/attendancePayrollController', 'Attendance & Payroll Controller'); 
// Load Attendance & Payroll Controller
//const attendancePayrollController = loadModule('./controller/attendancePayrollController', 'Attendance & Payroll Controller');
class AttendancePayrollController {

    // ==========================================
    // SALARY CONFIGURATION ENDPOINTS
    // ==========================================

    /**
     * Create or update salary configuration
     * POST /api/attendance-payroll/salary-config
     */
    static async createSalaryConfig(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation errors',
                    errors: errors.array()
                });
            }

            const {
                booking_id,
                service_provider_id,
                customer_id,
                monthly_salary,
                working_days_per_month = 26,
                pf_percentage = 12.00,
                pf_enabled = true,
                effective_from_date
            } = req.body;

            // Calculate per day salary
            const per_day_salary = (monthly_salary / working_days_per_month).toFixed(2);

            const configData = {
                booking_id,
                service_provider_id,
                customer_id,
                monthly_salary,
                per_day_salary,
                working_days_per_month,
                pf_percentage,
                pf_enabled,
                effective_from_date,
                created_by: req.user?.registration_id || customer_id
            };

            const result = await attendancePayrollQueries.upsertSalaryConfig(configData);

            res.status(201).json({
                success: true,
                message: 'Salary configuration saved successfully',
                data: {
                    config_id: result.insertId,
                    monthly_salary,
                    per_day_salary,
                    working_days_per_month,
                    pf_percentage
                }
            });

        } catch (error) {
            console.error('Create salary config error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to save salary configuration',
                error: error.message
            });
        }
    }

    /**
     * Get salary configuration by booking ID
     * GET /api/attendance-payroll/salary-config/:booking_id
     */
    static async getSalaryConfig(req, res) {
        try {
            const { booking_id } = req.params;

            const config = await attendancePayrollQueries.getSalaryConfigByBooking(booking_id);

            if (!config) {
                return res.status(404).json({
                    success: false,
                    message: 'Salary configuration not found'
                });
            }

            res.json({
                success: true,
                message: 'Salary configuration retrieved successfully',
                data: config
            });

        } catch (error) {
            console.error('Get salary config error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve salary configuration',
                error: error.message
            });
        }
    }

    // ==========================================
    // ATTENDANCE ENDPOINTS
    // ==========================================

    /**
     * Punch In - Customer marks service provider check-in
     * POST /api/attendance-payroll/punch-in
     */
    static async punchIn(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation errors',
                    errors: errors.array()
                });
            }

            const {
                service_provider_id,
                customer_id,
                booking_id,
                latitude,
                longitude
            } = req.body;

            // Get current date and time
            const attendance_date = new Date().toISOString().split('T')[0];
            const check_in_time = new Date().toISOString().slice(0, 19).replace('T', ' ');

            // Check if already punched in today
            const existing = await attendancePayrollQueries.getAttendanceByDate(
                service_provider_id, 
                attendance_date
            );

            if (existing && existing.check_in_time) {
                return res.status(400).json({
                    success: false,
                    message: 'Already punched in today',
                    data: {
                        check_in_time: existing.check_in_time,
                        attendance_date: existing.attendance_date
                    }
                });
            }

            const attendanceData = {
                service_provider_id,
                customer_id,
                booking_id,
                attendance_date,
                check_in_time,
                check_in_latitude: latitude,
                check_in_longitude: longitude,
                created_by: customer_id
            };

            await attendancePayrollQueries.punchIn(attendanceData);

            res.status(201).json({
                success: true,
                message: 'Punched in successfully',
                data: {
                    attendance_date,
                    check_in_time,
                    location: { latitude, longitude }
                }
            });

        } catch (error) {
            console.error('Punch in error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to punch in',
                error: error.message
            });
        }
    }

    /**
     * Punch Out - Customer marks service provider check-out
     * POST /api/attendance-payroll/punch-out
     */
    static async punchOut(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation errors',
                    errors: errors.array()
                });
            }

            const {
                service_provider_id,
                latitude,
                longitude
            } = req.body;

            const attendance_date = new Date().toISOString().split('T')[0];
            const check_out_time = new Date().toISOString().slice(0, 19).replace('T', ' ');

            // Check if punched in
            const existing = await attendancePayrollQueries.getAttendanceByDate(
                service_provider_id, 
                attendance_date
            );

            if (!existing || !existing.check_in_time) {
                return res.status(400).json({
                    success: false,
                    message: 'No check-in record found for today. Please punch in first.'
                });
            }

            if (existing.check_out_time) {
                return res.status(400).json({
                    success: false,
                    message: 'Already punched out today',
                    data: {
                        check_out_time: existing.check_out_time
                    }
                });
            }

            const attendanceData = {
                service_provider_id,
                attendance_date,
                check_out_time,
                check_out_latitude: latitude,
                check_out_longitude: longitude
            };

            await attendancePayrollQueries.punchOut(attendanceData);

            // Calculate worked hours
            const checkInTime = new Date(existing.check_in_time);
            const checkOutTime = new Date(check_out_time);
            const hours_worked = ((checkOutTime - checkInTime) / (1000 * 60 * 60)).toFixed(2);

            res.json({
                success: true,
                message: 'Punched out successfully',
                data: {
                    attendance_date,
                    check_in_time: existing.check_in_time,
                    check_out_time,
                    hours_worked,
                    location: { latitude, longitude }
                }
            });

        } catch (error) {
            console.error('Punch out error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to punch out',
                error: error.message
            });
        }
    }

    /**
     * Manual Attendance Entry - For missed punch in/out
     * POST /api/attendance-payroll/manual-attendance
     */
    static async manualAttendance(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation errors',
                    errors: errors.array()
                });
            }

            const {
                service_provider_id,
                customer_id,
                booking_id,
                attendance_date,
                check_in_time,
                check_out_time,
                status,
                notes
            } = req.body;

            const attendanceData = {
                service_provider_id,
                customer_id,
                booking_id,
                attendance_date,
                check_in_time,
                check_out_time,
                status,
                notes,
                created_by: req.user?.registration_id || customer_id
            };

            await attendancePayrollQueries.manualAttendanceEntry(attendanceData);

            res.status(201).json({
                success: true,
                message: 'Manual attendance recorded successfully',
                data: {
                    attendance_date,
                    status,
                    notes
                }
            });

        } catch (error) {
            console.error('Manual attendance error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to record manual attendance',
                error: error.message
            });
        }
    }

    /**
     * Mark Delay with notes
     * PUT /api/attendance-payroll/mark-delay
     */
    static async markDelay(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation errors',
                    errors: errors.array()
                });
            }

            const {
                service_provider_id,
                attendance_date,
                delay_minutes,
                notes
            } = req.body;

            const delayData = {
                service_provider_id,
                attendance_date,
                delay_minutes,
                notes,
                updated_by: req.user?.registration_id
            };

            await attendancePayrollQueries.markDelay(delayData);

            res.json({
                success: true,
                message: 'Delay marked successfully',
                data: {
                    attendance_date,
                    delay_minutes,
                    notes
                }
            });

        } catch (error) {
            console.error('Mark delay error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to mark delay',
                error: error.message
            });
        }
    }

    /**
     * Get attendance for a specific date
     * GET /api/attendance-payroll/attendance/:service_provider_id/:date
     */
    static async getAttendanceByDate(req, res) {
        try {
            const { service_provider_id, date } = req.params;

            const attendance = await attendancePayrollQueries.getAttendanceByDate(
                service_provider_id, 
                date
            );

            if (!attendance) {
                return res.status(404).json({
                    success: false,
                    message: 'No attendance record found for this date'
                });
            }

            res.json({
                success: true,
                message: 'Attendance retrieved successfully',
                data: attendance
            });

        } catch (error) {
            console.error('Get attendance error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve attendance',
                error: error.message
            });
        }
    }

    /**
     * Get monthly attendance for a service provider
     * GET /api/attendance-payroll/monthly-attendance/:service_provider_id/:month/:year
     */
    static async getMonthlyAttendance(req, res) {
        try {
            const { service_provider_id, month, year } = req.params;

            const attendance = await attendancePayrollQueries.getMonthlyAttendance(
                service_provider_id, 
                parseInt(month), 
                parseInt(year)
            );

            const stats = await attendancePayrollQueries.getMonthlyAttendanceStats(
                service_provider_id, 
                parseInt(month), 
                parseInt(year)
            );

            res.json({
                success: true,
                message: 'Monthly attendance retrieved successfully',
                data: {
                    attendance_records: attendance,
                    statistics: stats,
                    period: {
                        month: parseInt(month),
                        year: parseInt(year)
                    }
                }
            });

        } catch (error) {
            console.error('Get monthly attendance error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve monthly attendance',
                error: error.message
            });
        }
    }

    /**
     * Get all service providers attendance for a customer
     * GET /api/attendance-payroll/customer-attendance/:customer_id/:month/:year
     */
    static async getCustomerAttendance(req, res) {
        try {
            const { customer_id, month, year } = req.params;

            const attendance = await attendancePayrollQueries.getCustomerServiceProvidersAttendance(
                customer_id,
                parseInt(month),
                parseInt(year)
            );

            res.json({
                success: true,
                message: 'Customer attendance data retrieved successfully',
                data: {
                    service_providers: attendance,
                    period: {
                        month: parseInt(month),
                        year: parseInt(year)
                    }
                }
            });

        } catch (error) {
            console.error('Get customer attendance error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve customer attendance',
                error: error.message
            });
        }
    }

    // ==========================================
    // LEAVE MANAGEMENT ENDPOINTS
    // ==========================================

    /**
     * Apply for leave
     * POST /api/attendance-payroll/apply-leave
     */
    static async applyLeave(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation errors',
                    errors: errors.array()
                });
            }

            const {
                service_provider_id,
                customer_id,
                booking_id,
                leave_type,
                start_date,
                end_date,
                reason,
                is_paid = false
            } = req.body;

            // Validate dates
            const startDate = new Date(start_date);
            const endDate = new Date(end_date);

            if (endDate < startDate) {
                return res.status(400).json({
                    success: false,
                    message: 'End date cannot be before start date'
                });
            }

            const leaveData = {
                service_provider_id,
                customer_id,
                booking_id,
                leave_type,
                start_date,
                end_date,
                reason,
                is_paid
            };

            const result = await attendancePayrollQueries.applyLeave(leaveData);

            res.status(201).json({
                success: true,
                message: 'Leave application submitted successfully',
                data: {
                    leave_id: result.insertId,
                    leave_type,
                    start_date,
                    end_date,
                    status: 'PENDING'
                }
            });

        } catch (error) {
            console.error('Apply leave error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to submit leave application',
                error: error.message
            });
        }
    }

    /**
     * Approve or Reject leave
     * PUT /api/attendance-payroll/leave/:leave_id/status
     */
    static async updateLeaveStatus(req, res) {
        try {
            const { leave_id } = req.params;
            const { status, rejection_reason } = req.body;

            if (!['APPROVED', 'REJECTED'].includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid status. Must be APPROVED or REJECTED'
                });
            }

            if (status === 'REJECTED' && !rejection_reason) {
                return res.status(400).json({
                    success: false,
                    message: 'Rejection reason is required'
                });
            }

            const approved_by = req.user?.registration_id;

            await attendancePayrollQueries.updateLeaveStatus(
                leave_id,
                status,
                approved_by,
                rejection_reason
            );

            res.json({
                success: true,
                message: `Leave ${status.toLowerCase()} successfully`,
                data: {
                    leave_id,
                    status
                }
            });

        } catch (error) {
            console.error('Update leave status error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update leave status',
                error: error.message
            });
        }
    }

    /**
     * Get leave history for a service provider
     * GET /api/attendance-payroll/leave-history/:service_provider_id
     */
    static async getLeaveHistory(req, res) {
        try {
            const { service_provider_id } = req.params;
            const { status } = req.query;

            const leaves = await attendancePayrollQueries.getLeaveHistory(
                service_provider_id,
                status
            );

            res.json({
                success: true,
                message: 'Leave history retrieved successfully',
                data: {
                    leaves,
                    total_count: leaves.length
                }
            });

        } catch (error) {
            console.error('Get leave history error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve leave history',
                error: error.message
            });
        }
    }

    /**
     * Get pending leaves for a customer
     * GET /api/attendance-payroll/pending-leaves/:customer_id
     */
    static async getPendingLeaves(req, res) {
        try {
            const { customer_id } = req.params;

            const leaves = await attendancePayrollQueries.getPendingLeaves(customer_id);

            res.json({
                success: true,
                message: 'Pending leaves retrieved successfully',
                data: {
                    pending_leaves: leaves,
                    count: leaves.length
                }
            });

        } catch (error) {
            console.error('Get pending leaves error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve pending leaves',
                error: error.message
            });
        }
    }

    // ==========================================
    // PAYROLL ENDPOINTS
    // ==========================================

    /**
     * Generate monthly payroll for a service provider
     * POST /api/attendance-payroll/generate-payroll
     */
    static async generatePayroll(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation errors',
                    errors: errors.array()
                });
            }

            const { service_provider_id, month, year } = req.body;

            // Check if payroll already exists
            const existing = await attendancePayrollQueries.getPayrollByMonth(
                service_provider_id,
                month,
                year
            );

            if (existing) {
                return res.status(400).json({
                    success: false,
                    message: 'Payroll already exists for this period',
                    data: existing
                });
            }

            const payrollData = {
                service_provider_id,
                month,
                year,
                created_by: req.user?.registration_id
            };

            const result = await attendancePayrollQueries.generatePayroll(payrollData);

            res.status(201).json({
                success: true,
                message: 'Payroll generated successfully',
                data: result
            });

        } catch (error) {
            console.error('Generate payroll error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to generate payroll',
                error: error.message
            });
        }
    }

    /**
     * Get payroll by ID (includes full details for payslip)
     * GET /api/attendance-payroll/payroll/:payroll_id
     */
    static async getPayrollById(req, res) {
        try {
            const { payroll_id } = req.params;

            const payroll = await attendancePayrollQueries.getPayrollById(payroll_id);

            if (!payroll) {
                return res.status(404).json({
                    success: false,
                    message: 'Payroll not found'
                });
            }

            // Get attendance details for the period
            const attendance = await attendancePayrollQueries.getMonthlyAttendance(
                payroll.service_provider_id,
                payroll.period_month,
                payroll.period_year
            );

            res.json({
                success: true,
                message: 'Payroll retrieved successfully',
                data: {
                    payroll,
                    attendance_details: attendance
                }
            });

        } catch (error) {
            console.error('Get payroll error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve payroll',
                error: error.message
            });
        }
    }

    /**
     * Get all payrolls for a service provider
     * GET /api/attendance-payroll/payrolls/:service_provider_id
     */
    static async getServiceProviderPayrolls(req, res) {
        try {
            const { service_provider_id } = req.params;

            const payrolls = await attendancePayrollQueries.getAllPayrolls(service_provider_id);

            res.json({
                success: true,
                message: 'Payrolls retrieved successfully',
                data: {
                    payrolls,
                    total_count: payrolls.length
                }
            });

        } catch (error) {
            console.error('Get service provider payrolls error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve payrolls',
                error: error.message
            });
        }
    }

    /**
     * Get payrolls by customer (for all their service providers)
     * GET /api/attendance-payroll/customer-payrolls/:customer_id
     */
    static async getCustomerPayrolls(req, res) {
        try {
            const { customer_id } = req.params;
            const { month, year } = req.query;

            const payrolls = await attendancePayrollQueries.getPayrollsByCustomer(
                customer_id,
                month ? parseInt(month) : null,
                year ? parseInt(year) : null
            );

            res.json({
                success: true,
                message: 'Customer payrolls retrieved successfully',
                data: {
                    payrolls,
                    total_count: payrolls.length,
                    filter: month && year ? { month: parseInt(month), year: parseInt(year) } : null
                }
            });

        } catch (error) {
            console.error('Get customer payrolls error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve customer payrolls',
                error: error.message
            });
        }
    }

    /**
     * Mark payroll as paid
     * PUT /api/attendance-payroll/payroll/:payroll_id/mark-paid
     */
    static async markPayrollPaid(req, res) {
        try {
            const { payroll_id } = req.params;
            const { payment_mode, payment_reference } = req.body;

            if (!payment_mode) {
                return res.status(400).json({
                    success: false,
                    message: 'Payment mode is required'
                });
            }

            const paymentData = {
                payment_mode,
                payment_reference,
                payment_processed_by: req.user?.registration_id
            };

            await attendancePayrollQueries.markPayrollAsPaid(payroll_id, paymentData);

            res.json({
                success: true,
                message: 'Payroll marked as paid successfully',
                data: {
                    payroll_id,
                    payment_status: 'PAID',
                    payment_mode
                }
            });

        } catch (error) {
            console.error('Mark payroll paid error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to mark payroll as paid',
                error: error.message
            });
        }
    }

    /**
     * Get pending payrolls
     * GET /api/attendance-payroll/pending-payrolls
     */
    static async getPendingPayrolls(req, res) {
        try {
            const { customer_id } = req.query;

            const payrolls = await attendancePayrollQueries.getPendingPayrolls(
                customer_id ? parseInt(customer_id) : null
            );

            res.json({
                success: true,
                message: 'Pending payrolls retrieved successfully',
                data: {
                    pending_payrolls: payrolls,
                    count: payrolls.length
                }
            });

        } catch (error) {
            console.error('Get pending payrolls error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve pending payrolls',
                error: error.message
            });
        }
    }

    /**
     * Get payroll statistics/dashboard
     * GET /api/attendance-payroll/dashboard/:customer_id
     */
    static async getPayrollDashboard(req, res) {
        try {
            const { customer_id } = req.params;
            const currentMonth = new Date().getMonth() + 1;
            const currentYear = new Date().getFullYear();

            // Get current month payrolls
            const currentPayrolls = await attendancePayrollQueries.getPayrollsByCustomer(
                customer_id,
                currentMonth,
                currentYear
            );

            // Get pending payrolls
            const pendingPayrolls = await attendancePayrollQueries.getPendingPayrolls(customer_id);

            // Get current month attendance
            const attendance = await attendancePayrollQueries.getCustomerServiceProvidersAttendance(
                customer_id,
                currentMonth,
                currentYear
            );

            // Calculate totals
            const totalPending = pendingPayrolls.reduce((sum, p) => sum + parseFloat(p.net_salary), 0);
            const totalCurrent = currentPayrolls.reduce((sum, p) => sum + parseFloat(p.net_salary), 0);

            res.json({
                success: true,
                message: 'Dashboard data retrieved successfully',
                data: {
                    current_period: {
                        month: currentMonth,
                        year: currentYear
                    },
                    statistics: {
                        total_service_providers: attendance.length,
                        current_month_payroll: totalCurrent.toFixed(2),
                        pending_payments: totalPending.toFixed(2),
                        pending_count: pendingPayrolls.length
                    },
                    current_payrolls: currentPayrolls,
                    pending_payrolls: pendingPayrolls,
                    attendance_summary: attendance
                }
            });

        } catch (error) {
            console.error('Get dashboard error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve dashboard data',
                error: error.message
            });
        }
    }

    // Add these methods to your AttendancePayrollController class

    // ==========================================
    // SCREEN-SPECIFIC ENDPOINTS
    // ==========================================

    /**
     * Get all leaves with filters - MANAGE LEAVE SCREEN
     * GET /api/attendance-payroll/leaves/all
     */
    static async getAllLeaves(req, res) {
        try {
            const { status, customer_id, search } = req.query;

            const filters = {
                status: status || null,
                customer_id: customer_id ? parseInt(customer_id) : null,
                search: search || null
            };

            const leaves = await attendancePayrollQueries.getAllLeavesWithFilters(filters);
            const summary = await attendancePayrollQueries.getLeavesSummary();

            res.json({
                success: true,
                message: 'Leaves retrieved successfully',
                data: {
                    leaves,
                    summary
                }
            });

        } catch (error) {
            console.error('Get all leaves error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch leaves',
                error: error.message
            });
        }
    }

    /**
     * Get all attendances with filters - MANAGE ATTENDANCE SCREEN
     * GET /api/attendance-payroll/attendances/all
     */
    static async getAllAttendances(req, res) {
        try {
            const { 
                status, 
                customer_id, 
                date, 
                month, 
                year, 
                search 
            } = req.query;

            const filters = {
                status: status || null,
                customer_id: customer_id ? parseInt(customer_id) : null,
                date: date || null,
                month: month ? parseInt(month) : null,
                year: year ? parseInt(year) : null,
                search: search || null
            };

            const attendances = await attendancePayrollQueries.getAllAttendancesWithFilters(filters);
            const summary = await attendancePayrollQueries.getAttendancesSummary(
                filters.month, 
                filters.year
            );

            res.json({
                success: true,
                message: 'Attendances retrieved successfully',
                data: {
                    attendances,
                    summary
                }
            });

        } catch (error) {
            console.error('Get all attendances error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch attendances',
                error: error.message
            });
        }
    }

    /**
     * Get all payrolls with filters - MANAGE PAYROLL SCREEN
     * GET /api/attendance-payroll/payrolls/all
     */
    // static async getAllPayrolls(req, res) {
    //     try {
    //         const { 
    //             status, 
    //             month, 
    //             year, 
    //             customer_id, 
    //             search 
    //         } = req.query;

    //         const filters = {
    //             status: status || null,
    //             month: month ? parseInt(month) : null,
    //             year: year ? parseInt(year) : null,
    //             customer_id: customer_id ? parseInt(customer_id) : null,
    //             search: search || null
    //         };

    //         const payrolls = await attendancePayrollQueries.getAllPayrollsWithFilters(filters);
    //         const summary = await attendancePayrollQueries.getPayrollsSummary(
    //             filters.month, 
    //             filters.year
    //         );

    //         res.json({
    //             success: true,
    //             message: 'Payrolls retrieved successfully',
    //             data: {
    //                 payrolls,
    //                 summary,
    //                 total_count: payrolls.length
    //             }
    //         });

    //     } catch (error) {
    //         console.error('Get all payrolls error:', error);
    //         res.status(500).json({
    //             success: false,
    //             message: 'Failed to fetch payrolls',
    //             error: error.message
    //         });
    //     }
    // }
static async getAllPayrolls(req, res) {
    try {
        console.log('\n========================================');
        console.log('🔍 getAllPayrolls CALLED');
        console.log('Request URL:', req.url);
        console.log('Request query:', req.query);
        console.log('========================================');
        
        const filters = {
            status: req.query.status,
            month: req.query.month,
            year: req.query.year,
            customer_id: req.query.customer_id,
            search: req.query.search
        };

        console.log('📋 Filters:', JSON.stringify(filters, null, 2));
        console.log('Calling getAllPayrollsWithFilters...');

        const payrolls = await attendancePayrollQueries.getAllPayrollsWithFilters(filters);
        
        console.log('========================================');
        console.log('📊 PAYROLLS RESULT:');
        console.log('Type:', typeof payrolls);
        console.log('Is Array:', Array.isArray(payrolls));
        console.log('Length:', payrolls ? payrolls.length : 'NULL/UNDEFINED');
        console.log('First record:', payrolls && payrolls[0] ? payrolls[0] : 'NONE');
        console.log('========================================');

        console.log('Calling getPayrollsSummary...');
        const summary = await attendancePayrollQueries.getPayrollsSummary(
            filters.month, 
            filters.year
        );
        
        console.log('📊 SUMMARY RESULT:', JSON.stringify(summary, null, 2));
        console.log('========================================\n');

        const response = {
            success: true,
            message: 'Payrolls retrieved successfully',
            data: {
                payrolls: payrolls,
                summary: summary,
                total_count: payrolls.length
            }
        };

        console.log('📤 SENDING RESPONSE:');
        console.log('Payrolls count in response:', response.data.payrolls.length);
        console.log('========================================\n');

        res.json(response);

    } catch (error) {
        console.error('\n========================================');
        console.error('❌ ERROR in getAllPayrolls:');
        console.error('Message:', error.message);
        console.error('Stack:', error.stack);
        console.error('========================================\n');
        
        res.status(500).json({
            success: false,
            message: 'Failed to fetch payrolls',
            error: error.message
        });
    }
}

    /**
     * Get complete payroll details - PAYROLL DETAILS SCREEN
     * GET /api/attendance-payroll/payroll/:id/details
     */
    static async getPayrollDetails(req, res) {
        try {
            const { id } = req.params;

            const payroll = await attendancePayrollQueries.getPayrollDetailsById(id);

            if (!payroll) {
                return res.status(404).json({
                    success: false,
                    message: 'Payroll not found'
                });
            }

            // Get attendance breakdown
            const attendance = await attendancePayrollQueries.getMonthlyAttendance(
                payroll.service_provider_id,
                payroll.period_month,
                payroll.period_year
            );

            // Get leave details
            const leaves = await attendancePayrollQueries.getApprovedLeavesForMonth(
                payroll.service_provider_id,
                payroll.period_month,
                payroll.period_year
            );

            // Format response for UI
            const response = {
                header: {
                    employee_name: payroll.employee_name,
                    payroll_reference: payroll.payroll_reference
                },
                period_info: {
                    period: payroll.period,
                    working_days: payroll.working_days,
                    total_hrs: payroll.total_hrs,
                    leaves: payroll.leave_days
                },
                earnings_deductions: {
                    gross_salary: `Rs.${payroll.gross_salary}`,
                    deductions: `-Rs.${payroll.total_deductions}`,
                    net_salary: `Rs.${payroll.net_salary}`
                },
                payment: {
                    status: payroll.payment_status_display,
                    mode: payroll.payment_mode || '-',
                    txn_ref: payroll.payment_reference || '-',
                    processed_by: payroll.processed_by_name || '-',
                    processed_at: payroll.payment_date_formatted || '-'
                },
                attendance_breakdown: attendance.map(a => ({
                    date: a.date_formatted,
                    status: a.status,
                    check_in: a.check_in_formatted,
                    check_out: a.check_out_formatted,
                    hours: a.total_hours || 0,
                    delay_minutes: a.delay_minutes
                })),
                leave_details: leaves.map(l => ({
                    leave_type: l.leave_type,
                    start_date: l.start_date_formatted,
                    end_date: l.end_date_formatted,
                    total_days: l.total_days,
                    reason: l.reason
                }))
            };

            res.json({
                success: true,
                message: 'Payroll details retrieved successfully',
                data: response
            });

        } catch (error) {
            console.error('Get payroll details error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch payroll details',
                error: error.message
            });
        }
    }

    // ==========================================
    // EXPORT ENDPOINTS
    // ==========================================

    /**
     * Export leaves data
     * GET /api/attendance-payroll/leaves/export
     */
    static async exportLeaves(req, res) {
        try {
            const leaves = await attendancePayrollQueries.getExportLeaves();

            res.json({
                success: true,
                message: 'Leave data ready for export',
                data: leaves
            });

        } catch (error) {
            console.error('Export leaves error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to export leaves',
                error: error.message
            });
        }
    }

    /**
     * Export attendances data
     * GET /api/attendance-payroll/attendances/export
     */
    static async exportAttendances(req, res) {
        try {
            const { month, year } = req.query;

            const attendances = await attendancePayrollQueries.getExportAttendances(
                month ? parseInt(month) : null,
                year ? parseInt(year) : null
            );

            res.json({
                success: true,
                message: 'Attendance data ready for export',
                data: attendances
            });

        } catch (error) {
            console.error('Export attendances error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to export attendances',
                error: error.message
            });
        }
    }

    /**
     * Export payrolls data
     * GET /api/attendance-payroll/payrolls/export
     */
    static async exportPayrolls(req, res) {
        try {
            const { month, year } = req.query;

            const payrolls = await attendancePayrollQueries.getExportPayrolls(
                month ? parseInt(month) : null,
                year ? parseInt(year) : null
            );

            res.json({
                success: true,
                message: 'Payroll data ready for export',
                data: payrolls
            });

        } catch (error) {
            console.error('Export payrolls error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to export payrolls',
                error: error.message
            });
        }
    }
}

module.exports = AttendancePayrollController;