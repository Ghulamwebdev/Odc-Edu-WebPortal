import { useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Switch,
  Table,
  Tag,
  Upload,
  message,
} from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { MdPeopleAlt } from "react-icons/md";
import { getCourses } from "../../services/feeService";
import {
  createEmployee,
  deleteEmployee,
  getEmployees,
  updateEmployeeModuleAccess,
  updateEmployee,
  updateEmployeeStatus,
} from "../../services/employeeService";
import { createStudentPortalAccounts } from "../../services/studentPortalAccountService";
import { useModulePermissions } from "../../hooks/usePermissions";

const beforeUpload = (file) => {
  const isAllowed = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
  if (!isAllowed) {
    message.error("Profile picture must be JPG, PNG, or WEBP.");
    return Upload.LIST_IGNORE;
  }
  if (file.size > 2 * 1024 * 1024) {
    message.error("Profile picture must be 2MB or smaller.");
    return Upload.LIST_IGNORE;
  }
  return false;
};

const EmployeeManagement = () => {
  const permissions = useModulePermissions("employees");
  const [employees, setEmployees] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [form] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      const [employeesResponse, coursesResponse] = await Promise.all([
        getEmployees(),
        getCourses(),
      ]);
      setEmployees(employeesResponse.data || []);
      setCourses(coursesResponse.data || []);
    } catch (error) {
      message.error(error.message || "Failed to load employees");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const courseOptions = useMemo(
    () =>
      courses.map((course) => ({
        value: course._id,
        label: `${course.courseName} (${course.courseId})`,
      })),
    [courses],
  );

  const filteredEmployees = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return employees;
    return employees.filter((employee) =>
      [
        employee.name,
        employee.email,
        employee.phone,
        employee.designation,
        ...(employee.courses || []).map((course) => course?.courseName),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(keyword),
    );
  }, [employees, searchTerm]);

  const openCreateModal = () => {
    if (!permissions.create) return message.warning("You do not have permission to create employees.");
    setEditingEmployee(null);
    form.resetFields();
    form.setFieldsValue({ status: "active", courseIds: [] });
    setModalOpen(true);
  };

  const openEditModal = (employee) => {
    if (!permissions.update) return message.warning("You do not have permission to update employees.");
    setEditingEmployee(employee);
    form.setFieldsValue({
      name: employee.name,
      email: employee.email,
      phone: employee.phone,
      designation: employee.designation,
      status: employee.isActive ? "active" : "inactive",
      password: "",
      courseIds: employee.courseIds || [],
      profile: [],
    });
    setModalOpen(true);
  };

  const confirmCreateStudentAccounts = (courseIds = []) => {
    const selectedCourseIds = (courseIds || []).filter(Boolean);
    if (!selectedCourseIds.length) return;

    Modal.confirm({
      title: "Create student portal accounts?",
      content:
        "This will create login accounts for all enrolled students linked with the selected employee courses. Existing student accounts will be skipped.",
      okText: "Yes, Create Accounts",
      cancelText: "Cancel",
      okButtonProps: { className: "!bg-primary !border-primary" },
      onOk: async () => {
        const response = await createStudentPortalAccounts({
          courseIds: selectedCourseIds,
          academyEmail: "odcacdemy@gmail.com",
        });
        const created = response.data?.created?.length || 0;
        const skipped = response.data?.skipped?.length || 0;
        message.success(`${created} student account(s) created. ${skipped} existing account(s) skipped.`);
      },
    });
  };

  const handleSave = async (values) => {
    setSaving(true);
    try {
      const payload = {
        ...values,
        profile: values.profile?.fileList || values.profile || [],
      };

      if (!payload.password) {
        delete payload.password;
      }

      if (editingEmployee) {
        await updateEmployee(editingEmployee._id, payload);
        message.success("Employee updated successfully");
      } else {
        await createEmployee(payload);
        message.success("Employee created successfully");
      }

      setModalOpen(false);
      form.resetFields();
      await loadData();
      confirmCreateStudentAccounts(payload.courseIds);
    } catch (error) {
      message.error(error.message || "Failed to save employee");
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      title: "Employee",
      key: "employee",
      render: (_, employee) => (
        <div className="flex items-center gap-3">
          <Avatar src={employee.profile} size={42}>
            {employee.name?.slice(0, 1)}
          </Avatar>
          <div>
            <div className="font-ArialBold text-primary">{employee.name}</div>
            <div className="text-xs text-slate-500">{employee.email}</div>
          </div>
        </div>
      ),
    },
    { title: "Phone", dataIndex: "phone", key: "phone", render: (value) => value || "N/A" },
    {
      title: "Designation",
      dataIndex: "designation",
      key: "designation",
      render: (value) => value || "Employee",
    },
    {
      title: "Courses",
      key: "courses",
      render: (_, employee) => (
        <div className="flex flex-wrap gap-1">
          {(employee.courses || []).slice(0, 3).map((course) => (
            <Tag key={course._id} color="blue">{course.courseName}</Tag>
          ))}
          {(employee.courses || []).length > 3 ? (
            <Tag>+{employee.courses.length - 3}</Tag>
          ) : null}
        </div>
      ),
    },
    {
      title: "Employees Module",
      key: "employeeModule",
      render: (_, employee) => (
        <Switch
          checked={employee.employeeModuleEnabled}
          onChange={async (enabled) => {
            try {
              await updateEmployeeModuleAccess(employee._id, enabled);
              setEmployees((currentEmployees) =>
                currentEmployees.map((currentEmployee) =>
                  currentEmployee._id === employee._id
                    ? { ...currentEmployee, employeeModuleEnabled: enabled }
                    : currentEmployee,
                ),
              );
              message.success(
                `Employees module ${enabled ? "enabled" : "disabled"} for ${employee.name}`,
              );
            } catch (error) {
              message.error(error.message || "Failed to update employee module access");
            }
          }}
        />
      ),
    },
    {
      title: "Status",
      key: "status",
      render: (_, employee) => (
        <div className="flex items-center gap-2">
          <Switch
            checked={employee.isActive}
            disabled={!permissions.update}
            onChange={async (checked) => {
              await updateEmployeeStatus(employee._id, checked);
              message.success(`Employee ${checked ? "activated" : "deactivated"}`);
              loadData();
            }}
          />
          <Tag color={employee.isActive ? "green" : "red"}>
            {employee.isActive ? "Active" : "Inactive"}
          </Tag>
        </div>
      ),
    },
    {
      title: "Actions",
      key: "actions",
      render: (_, employee) => (
        <div className="flex gap-2">
          {permissions.update ? (
            <Button icon={<EditOutlined />} onClick={() => openEditModal(employee)} />
          ) : null}
          {permissions.delete ? (
            <Popconfirm
              title="Delete Employee"
              description="Are you sure you want to delete this employee?"
              onConfirm={async () => {
                await deleteEmployee(employee._id);
                message.success("Employee deleted successfully");
                loadData();
              }}
              okButtonProps={{ danger: true }}
            >
              <Button danger icon={<DeleteOutlined />} />
            </Popconfirm>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
            <MdPeopleAlt size={22} style={{ color: "#E8FC0A" }} />
          </div>
          <div>
            <h2 className="module-title">Employee Accounts</h2>
            <p className="module-subtitle">Create portal login accounts and assign courses</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={<ReloadOutlined />} onClick={loadData}>Refresh</Button>
          {permissions.create ? (
            <Button type="primary" icon={<PlusOutlined />} className="btn-lg" onClick={openCreateModal}>
              Create Employee Account
            </Button>
          ) : null}
        </div>
      </div>

      <div className="rounded-[16px] border border-slate-200 bg-white p-4">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#8ea2c4]">
              Login Accounts
            </div>
            <div className="mt-1 text-[11px] text-[#64748b]">
              {filteredEmployees.length} employee{filteredEmployees.length === 1 ? "" : "s"} found
            </div>
          </div>
          <Input.Search
            allowClear
            className="md:w-[430px]"
            placeholder="Search employees by name, course, email..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>

        {employees.length ? (
          <Table
            rowKey="_id"
            loading={loading}
            dataSource={filteredEmployees}
            columns={columns}
            pagination={{ pageSize: 8 }}
            scroll={{ x: "max-content" }}
          />
        ) : (
          <Empty description={loading ? "Loading employees..." : "No employees found"} />
        )}
      </div>

      <Modal
        title={editingEmployee ? "Edit Employee" : "Create Employee"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={saving}
        okText={editingEmployee ? "Update Employee" : "Create Employee"}
        width={760}
        okButtonProps={{ className: "!bg-primary !border-primary" }}
      >
        <Form layout="vertical" form={form} onFinish={handleSave}>
          <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
            <Form.Item name="name" label="Full Name" rules={[{ required: true, message: "Full name is required" }]}>
              <Input className="form-input" placeholder="Employee full name" />
            </Form.Item>
            <Form.Item
              name="email"
              label="Email"
              rules={[{ required: true, message: "Email is required" }, { type: "email", message: "Enter a valid email" }]}
            >
              <Input className="form-input" placeholder="employee@example.com" />
            </Form.Item>
            <Form.Item name="phone" label="Phone">
              <Input className="form-input" placeholder="Phone number" />
            </Form.Item>
            <Form.Item name="designation" label="Designation / Role" rules={[{ required: true, message: "Designation is required" }]}>
              <Input className="form-input" placeholder="Coordinator, Instructor, Counselor..." />
            </Form.Item>
            <Form.Item
              name="password"
              label="Password"
              rules={[
                { required: !editingEmployee, message: "Password is required" },
                { min: 6, message: "Minimum 6 characters" },
              ]}
            >
              <Input.Password className="form-input password-input" placeholder={editingEmployee ? "Leave blank to keep current password" : "Create password"} />
            </Form.Item>
            <Form.Item name="status" label="Status" rules={[{ required: true }]}>
              <Select
                className="form-input"
                options={[
                  { label: "Active", value: "active" },
                  { label: "Inactive", value: "inactive" },
                ]}
              />
            </Form.Item>
          </div>
          <Form.Item name="courseIds" label="Assigned Courses">
            <Select
              mode="multiple"
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Select courses"
              options={courseOptions}
              className="course-multi-select"
            />
          </Form.Item>
          <Form.Item name="profile" label="Profile Picture">
            <Upload beforeUpload={beforeUpload} maxCount={1} listType="picture">
              <Button icon={<UploadOutlined />}>Select JPG, PNG, or WEBP</Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default EmployeeManagement;
