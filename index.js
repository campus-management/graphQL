require('dotenv').config();
const {ApolloServer, gql} = require('apollo-server');

// Base URLs from environment variables
const STUDENT_BASE = process.env.STUDENT_BASE;
const COURSE_BASE = process.env.COURSE_BASE;
const AI_BASE = process.env.AI_BASE;
const PORT = process.env.PORT;

// small helper for fetch with JSON
async function callApi(method, url, body = undefined) {
    const opts = {method, headers: {}};
    if (body !== undefined) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

// GraphQL schema
const typeDefs = gql`
    type University {
        id: ID
        name: String
        location: String
    }

    type Student {
        id: ID
        firstName: String
        lastName: String
        email: String
        university: University
    }

    input StudentInput {
        firstName: String!
        lastName: String!
        email: String!
        universityId: ID!
    }

    type Course {
        id: ID
        name: String
        instructor: String
        category: String
        schedule: String
    }

    input CourseInput {
        name: String!
        instructor: String!
        category: String!
        schedule: String!
    }

    input CourseUpdateInput {
        name: String
        instructor: String
        category: String
        schedule: String
    }

    type StudentCourse {
        id: ID
        student: Student
        course: Course
    }
    
    input StudentCourseInput {
        student_id: ID!
        course: ID!
    }

    type AIResult {
        result: String
    }

    type Query {
        # Students
        getAllStudents: [Student]                     # calls /student/getAll
        studentSearch(id: ID, university: ID, name: String): [Student]  # calls /student/search

        # Courses
        getAllCourses: [Course]                       # calls /courses/getall/
        coursesSearch(name: String, instructor: String, category: String): [Course] # calls /courses/?...

        studentCourses(student_id: ID, course: ID): [StudentCourse]

        # AI
        summarize(text: String!): AIResult
        translate(text: String!, src: String!, target: String!): AIResult
    }

    type Mutation {
        # Students CRUD
        addStudent(input: StudentInput!): Student
        updateStudent(id: ID!, input: StudentInput!): Student
        deleteStudent(id: ID!): Boolean

        # Courses CRUD
        addCourse(input: CourseInput!): Course
        updateCourse(id: ID!, input: CourseUpdateInput!): Course
        deleteCourse(id: ID!): Boolean

        addStudentCourse(input: StudentCourseInput!): StudentCourse
    }
`;

// Resolvers: map GraphQL ops to your REST endpoints
const resolvers = {
    Query: {
        // Students
        getAllStudents: async () => {
            return callApi('GET', `${STUDENT_BASE}/student/getAll`);
        },
        studentSearch: async (_, args) => {
            const params = new URLSearchParams();
            if (args.id) params.append('id', args.id);
            if (args.university) params.append('university', args.university);
            if (args.name) params.append('name', args.name);
            const url = `${STUDENT_BASE}/student/search?${params.toString()}`;
            return callApi('GET', url);
        },

        // Courses
        getAllCourses: async () => {
            return callApi('GET', `${COURSE_BASE}/courses/getall/`);
        },
        coursesSearch: async (_, args) => {
            const params = new URLSearchParams();
            if (args.name) params.append('name', args.name);
            if (args.instructor) params.append('instructor', args.instructor);
            if (args.category) params.append('category', args.category);
            const url = `${COURSE_BASE}/courses/?${params.toString()}`;
            return callApi('GET', url);
        },

        studentCourses: async (_, args) => {
            const params = new URLSearchParams();
            if (args.student_id) params.append("student_id", args.student_id);
            if (args.course) params.append("course", args.course);
            const res = await fetch(`${COURSE_BASE}/student-courses/?${params}`);
            return res.json();
        },

        // AI
        summarize: async (_, {text}) => {
            const res = await callApi('POST', `${AI_BASE}/chatbot/summarize/`, {text});
            return {result: typeof res === 'string' ? res : (res.result || JSON.stringify(res))};
        },
        translate: async (_, {text, src, target}) => {
            const res = await callApi('POST', `${AI_BASE}/chatbot/translate/`, {
                text,
                src_language: src,
                target_language: target
            });
            return {result: typeof res === 'string' ? res : (res.result || JSON.stringify(res))};
        },
    },

    Mutation: {
        // Students
        addStudent: async (_, {input}) => {
            const body = {
                firstName: input.firstName,
                lastName: input.lastName,
                email: input.email,
                university: {id: input.universityId ? Number(input.universityId) : undefined}
            };
            return callApi('POST', `${STUDENT_BASE}/student/add`, body);
        },
        updateStudent: async (_, {id, input}) => {
            const body = {
                firstName: input.firstName,
                lastName: input.lastName,
                email: input.email,
                university: {id: input.universityId ? Number(input.universityId) : undefined}
            };
            return callApi('PUT', `${STUDENT_BASE}/student/update/${id}`, body);
        },
        deleteStudent: async (_, {id}) => {
            const res = await callApi('DELETE', `${STUDENT_BASE}/student/delete/${id}`);
            // assume deletion returns success indicator; normalize to boolean
            if (typeof res === 'object' && 'success' in res) return !!res.success;
            if (typeof res === 'string') return res.length > 0;
            return true;
        },

        // Courses
        addCourse: async (_, {input}) => {
            return callApi('POST', `${COURSE_BASE}/courses/`, {
                name: input.name,
                instructor: input.instructor,
                category: input.category,
                schedule: input.schedule
            });
        },
        updateCourse: async (_, {id, input}) => {
            return callApi('PUT', `${COURSE_BASE}/courses/${id}/`, {
                name: input.name,
                instructor: input.instructor,
                category: input.category,
                schedule: input.schedule
            });
        },
        deleteCourse: async (_, {id}) => {
            const res = await callApi('DELETE', `${COURSE_BASE}/courses/delete/${id}/`);
            if (typeof res === 'object' && 'success' in res) return !!res.success;
            return true;
        },
        addStudentCourse: async (_, {input}) => {
            const sId = (input.student_id && typeof input.student_id === 'object') ? input.student_id.id : input.student_id;
            const cId = (input.course && typeof input.course === 'object') ? input.course.id : input.course;

            const body = {
                student_id: sId !== undefined ? Number(sId) : undefined,
                course: cId !== undefined ? Number(cId) : undefined
            };
            return callApi('POST', `${COURSE_BASE}/student-courses/`, body);
        },
    },

    StudentCourse: {
        student: async (parent) => {
            const id = parent.student_id || (parent.student && parent.student.id);
            if (!id) return null;
            const params = new URLSearchParams();
            params.append('id', id);
            const url = `${STUDENT_BASE}/student/search?${params.toString()}`;
            const students = await callApi('GET', url);
            return Array.isArray(students) && students.length > 0 ? students[0] : null;
        },
        course: async (parent) => {
            const id = parent.course || (parent.course && parent.course.id);
            if (!id) return null;
            const params = new URLSearchParams();
            params.append('id', id);
            const url = `${COURSE_BASE}/courses/?${params.toString()}`;
            const courses = await callApi('GET', url);
            return Array.isArray(courses) && courses.length > 0 ? courses[0] : null;
        },
    },

};

// Start server
const server = new ApolloServer({typeDefs, resolvers});
server.listen({port: PORT}).then(({url}) => {
    console.log(`GraphQL Gateway running at ${url}`);
});
