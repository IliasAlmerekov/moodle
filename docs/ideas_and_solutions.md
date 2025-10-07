# Ideas and Solutions

## Top 3 Documented Solutions

### 1. AI Learning Companion inside Moodle

**Problem addressed:**
Students lose motivation, can't recognize learning goals, and waste time searching for materials.

**Solution:**
Integrate an AI Learning Companion directly into Moodle that provides:

- Smart search and summaries of lessons and uploaded files
- Answers to general questions and questions about school

**Expected impact:**
Students stay focused on clear objectives, spend less time searching for relevant materials.

**Evaluation criteria:**

- [ ] Time saved per student when searching for learning materials (target: 30% reduction)
- [ ] Student satisfaction with AI-generated summaries (target: >75% positive feedback)
- [ ] Accuracy of answers to school-related questions (target: >85% correct responses)
- [ ] User adoption rate after 4 weeks (target: >60% of students use it regularly)

---

### 2. Adaptive AI Tutor for Differentiated Learning

**Problem addressed:**
Unequal learning results — strong students advance quickly, weaker ones fall behind.

**Solution:**
Implement an AI Support system to help with different problems:

- The AI explains assignments in simple language
- AI can help explain tasks in more detail to prevent asking teachers repeatedly
- Support multilingual explanations for non-native speakers

**Expected impact:**
More balanced learning outcomes, reduced frustration for struggling students.

**Evaluation criteria:**

- [ ] Improvement in test scores for struggling students (target: +15% average)
- [ ] Reduction in achievement gap between strong and weak students (target: 20% narrower)
- [ ] Student confidence increase (measured via survey, target: >70% feel more confident)
- [ ] Number of repetitive teacher questions reduced (target: 40% decrease)
- [ ] Multilingual support usage rate (track language preferences)

---

### 3. AI Support Center for Teachers

**Problem addressed:**
Teachers spend too much time repeating explanations and answering the same questions.

**Solution:**
Add an AI Teacher Assistant module that:

- Automatically answers frequently asked questions from students
- Assists in explaining learning fields if someone has not understood the goal

**Expected impact:**
Teachers save time on routine explanations and can focus on individual student feedback and creative teaching.

**Evaluation criteria:**

- [ ] Teacher time saved per week (target: 3-5 hours)
- [ ] Percentage of student questions answered by AI vs. teacher (target: >50% by AI)
- [ ] Teacher satisfaction with AI assistant (target: >80% positive feedback)
- [ ] Quality of AI explanations rated by teachers (target: >75% "good" or "excellent")
- [ ] Increase in time spent on creative teaching activities (measured via teacher logs)

---

## Implementation Priority

Based on impact vs. effort:

1. **Phase 1 (MVP):** AI Learning Companion (Solution 1)

   - Direct integration with existing Moodle structure
   - Immediate value for students
   - Foundation for other features

2. **Phase 2:** AI Support Center for Teachers (Solution 3)

   - Builds on Phase 1 infrastructure
   - High teacher buy-in potential
   - Reduces bottlenecks

3. **Phase 3:** Adaptive AI Tutor (Solution 2)
   - Most complex implementation
   - Requires data from Phases 1-2
   - Highest long-term impact

---

## Technical Requirements

### Minimum viable features:

- Ollama integration for LLM capabilities
- Moodle webservice API integration
- Chat interface within Moodle
- Basic context awareness (course, user role)

### Nice-to-have features:

- Streaming responses for better UX
- File upload and analysis
- Multilingual support (German, English, others)
- Learning analytics dashboard
- Personalized learning paths
