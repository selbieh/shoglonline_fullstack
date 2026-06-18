import factory

from apps.jobs.models import Job

from .accounts import UserFactory
from .catalog import CategoryFactory


class JobFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Job

    employer = factory.SubFactory(UserFactory)
    title = factory.Sequence(lambda n: f"وظيفة {n}")
    description = "وصف الوظيفة"
    category = factory.SubFactory(CategoryFactory)
    slug = factory.Sequence(lambda n: f"job-{n}")
    budget_min = 10
    budget_max = 500
    status = Job.Status.PUBLISHED
